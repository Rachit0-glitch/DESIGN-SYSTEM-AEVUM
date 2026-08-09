import bmesh
import bpy
import hashlib
import json
import math
from mathutils import Vector

IDENTITY_KEY = "aevum.entity_id"
VERSION = "1.0.0"

SUPPORTED_PROFESSIONAL = {
    "mesh.topology_inspect", "mesh.validate", "mesh.extrude", "mesh.inset", "mesh.bevel",
    "mesh.loop_cut", "mesh.subdivide", "mesh.solidify", "mesh.mirror", "mesh.join", "mesh.separate",
    "mesh.merge_vertices", "mesh.delete_vertices", "mesh.delete_edges", "mesh.delete_faces",
    "mesh.recalculate_normals", "mesh.flip_normals", "mesh.set_shading", "mesh.set_origin", "mesh.set_pivot",
    "topology.decimate", "topology.remesh", "topology.delete_loose", "topology.fill_holes",
    "topology.triangulate", "topology.tris_to_quads", "uv.inspect", "uv.create_layer", "uv.delete_layer",
    "uv.set_active_layer", "uv.mark_seam", "uv.clear_seams", "uv.unwrap", "uv.pack", "uv.transform",
    "uv.texel_density", "uv.udim_inspect", "material.validate_pbr", "optimization.analyze",
    "optimization.generate_lod",
}


class ProfessionalFailure(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def fingerprint(value):
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def find_object(entity_id):
    for obj in bpy.data.objects:
        if obj.get(IDENTITY_KEY) == entity_id:
            if obj.type != "MESH" or obj.data is None:
                raise ProfessionalFailure("MESH_NOT_FOUND", "Requested entity is not a mesh object.")
            return obj
    raise ProfessionalFailure("MESH_NOT_FOUND", "Requested mesh object was not found.")


def find_material(entity_id):
    for material in bpy.data.materials:
        if material.get(IDENTITY_KEY) == entity_id:
            return material
    raise ProfessionalFailure("BLENDER_MATERIAL_NOT_FOUND", "Requested material was not found.")


def bmesh_for(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    return bm


def commit_bmesh(obj, bm):
    bm.normal_update()
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    bpy.context.view_layer.update()


def indices(values):
    return sorted(item.index for item in values)


def element_center(element):
    if isinstance(element, bmesh.types.BMVert):
        return element.co
    vertices = list(element.verts)
    return sum((vertex.co for vertex in vertices), Vector()) / max(1, len(vertices))


def validate_indices(values, requested):
    result = []
    for index in requested:
        if index >= len(values):
            raise ProfessionalFailure("MESH_ELEMENT_NOT_FOUND", "Selection references a missing mesh element.")
        result.append(values[index])
    return result


def connected_component(seed, domain):
    found = {seed}
    queue = [seed]
    while queue:
        item = queue.pop(0)
        if domain == "VERTEX":
            neighbors = [edge.other_vert(item) for edge in item.link_edges]
        elif domain == "EDGE":
            neighbors = [edge for vertex in item.verts for edge in vertex.link_edges]
        else:
            neighbors = [face for edge in item.edges for face in edge.link_faces]
        for neighbor in neighbors:
            if neighbor not in found:
                found.add(neighbor)
                queue.append(neighbor)
    return sorted(found, key=lambda value: value.index)


def select_elements(bm, selection, budget):
    kind = selection["kind"]
    domain = selection.get("domain")
    if kind == "VERTEX_IDS":
        domain, result = "VERTEX", validate_indices(bm.verts, selection["indices"])
    elif kind == "EDGE_IDS":
        domain, result = "EDGE", validate_indices(bm.edges, selection["indices"])
    elif kind == "FACE_IDS":
        domain, result = "FACE", validate_indices(bm.faces, selection["indices"])
    elif kind == "ALL":
        result = list({"VERTEX": bm.verts, "EDGE": bm.edges, "FACE": bm.faces}[domain])
    elif kind == "MATERIAL_SLOT":
        domain = "FACE"
        result = [face for face in bm.faces if face.material_index == selection["materialSlot"]]
    elif kind == "CONNECTED_COMPONENT":
        values = {"VERTEX": bm.verts, "EDGE": bm.edges, "FACE": bm.faces}[domain]
        seed = validate_indices(values, [selection["seedIndex"]])[0]
        result = connected_component(seed, domain)
    elif kind == "BOUNDARY_LOOP":
        domain = "EDGE"
        seed = validate_indices(bm.edges, [selection["seedEdgeIndex"]])[0]
        if not seed.is_boundary:
            raise ProfessionalFailure("MESH_SELECTION_INVALID", "Boundary selector seed is not a boundary edge.")
        found = {seed}
        queue = [seed]
        while queue:
            edge = queue.pop(0)
            for vertex in edge.verts:
                for neighbor in vertex.link_edges:
                    if neighbor.is_boundary and neighbor not in found:
                        found.add(neighbor)
                        queue.append(neighbor)
        result = sorted(found, key=lambda value: value.index)
    elif kind == "BY_NORMAL_DIRECTION":
        domain = "FACE"
        direction = Vector((selection["direction"]["x"], selection["direction"]["y"], selection["direction"]["z"]))
        if direction.length == 0:
            raise ProfessionalFailure("MESH_SELECTION_INVALID", "Normal direction cannot be zero.")
        direction.normalize()
        result = [face for face in bm.faces if face.normal.dot(direction) >= selection["minimumDot"]]
    elif kind == "BY_POSITION_RANGE":
        values = {"VERTEX": bm.verts, "EDGE": bm.edges, "FACE": bm.faces}[domain]
        low = selection["minimum"]
        high = selection["maximum"]
        if any(low[axis] > high[axis] for axis in ("x", "y", "z")):
            raise ProfessionalFailure("MESH_SELECTION_INVALID", "Position range minimum exceeds maximum.")
        result = [
            item for item in values
            if low["x"] <= element_center(item).x <= high["x"]
            and low["y"] <= element_center(item).y <= high["y"]
            and low["z"] <= element_center(item).z <= high["z"]
        ]
    else:
        raise ProfessionalFailure("MESH_SELECTION_INVALID", "Unsupported deterministic mesh selector.")
    if not result:
        raise ProfessionalFailure("MESH_SELECTION_INVALID", "Deterministic mesh selection is empty.")
    if len(result) > budget["professional"]["maxSelectedElements"]:
        raise ProfessionalFailure("MESH_LIMIT_EXCEEDED", "Mesh selection exceeds the resource budget.")
    return domain, result


def duplicate_candidates(bm, epsilon=1.0e-6):
    buckets = {}
    for vertex in bm.verts:
        key = tuple(round(value / epsilon) for value in vertex.co)
        buckets.setdefault(key, 0)
        buckets[key] += 1
    return sum(count - 1 for count in buckets.values() if count > 1)


def connected_components(bm):
    remaining = set(bm.verts)
    count = 0
    while remaining:
        count += 1
        found = connected_component(next(iter(remaining)), "VERTEX")
        remaining.difference_update(found)
    return count


def topology_report(obj, profile):
    bm = bmesh_for(obj)
    triangles = sum(max(0, len(face.verts) - 2) for face in bm.faces)
    boundary = [edge for edge in bm.edges if edge.is_boundary]
    non_manifold = [edge for edge in bm.edges if not edge.is_manifold]
    loose_vertices = [vertex for vertex in bm.verts if not vertex.link_edges]
    loose_edges = [edge for edge in bm.edges if not edge.link_faces]
    zero_faces = [face for face in bm.faces if face.calc_area() <= 1.0e-12]
    degenerate_edges = [edge for edge in bm.edges if edge.calc_length() <= 1.0e-9]
    duplicates = duplicate_candidates(bm)
    diagnostics = []
    if non_manifold:
        diagnostics.append({"code": "MESH_NON_MANIFOLD", "severity": "ERROR", "message": "Mesh has non-manifold edges.", "elementIndices": indices(non_manifold), "approximate": False})
    if zero_faces or degenerate_edges:
        diagnostics.append({"code": "MESH_DEGENERATE", "severity": "ERROR", "message": "Mesh has degenerate geometry.", "approximate": False})
    if duplicates:
        diagnostics.append({"code": "MESH_DEGENERATE", "severity": "WARNING", "message": "Mesh has duplicate-position vertex candidates.", "approximate": True})
    invalid = bool(zero_faces or degenerate_edges)
    issue_count = len(non_manifold) + len(loose_vertices) + len(loose_edges) + duplicates
    quality = "INVALID" if invalid else "POOR" if issue_count > 10 else "ACCEPTABLE" if issue_count else "GOOD"
    if not issue_count and all(len(face.verts) == 4 for face in bm.faces):
        quality = "EXCELLENT"
    body = {
        "version": VERSION, "objectId": obj.get(IDENTITY_KEY), "profile": profile, "quality": quality,
        "vertexCount": len(bm.verts), "edgeCount": len(bm.edges), "faceCount": len(bm.faces),
        "triangleCount": triangles, "triangleFaceCount": sum(1 for face in bm.faces if len(face.verts) == 3),
        "quadCount": sum(1 for face in bm.faces if len(face.verts) == 4),
        "ngonCount": sum(1 for face in bm.faces if len(face.verts) > 4),
        "boundaryEdgeCount": len(boundary), "nonManifoldEdgeCount": len(non_manifold),
        "looseVertexCount": len(loose_vertices), "looseEdgeCount": len(loose_edges), "looseFaceCount": 0,
        "duplicatePositionCandidateCount": duplicates, "zeroAreaFaceCount": len(zero_faces),
        "degenerateEdgeCount": len(degenerate_edges), "connectedComponentCount": connected_components(bm),
        "eulerCharacteristic": len(bm.verts) - len(bm.edges) + len(bm.faces), "diagnostics": diagnostics,
    }
    bm.free()
    body["fingerprint"] = fingerprint(body)
    return body


def uv_islands(mesh):
    if not mesh.polygons:
        return 0
    remaining = set(range(len(mesh.polygons)))
    adjacency = {index: set() for index in remaining}
    edges_by_key = {tuple(sorted(edge.key)): edge for edge in mesh.edges}
    edge_faces = {}
    for polygon in mesh.polygons:
        for key in polygon.edge_keys:
            edge_faces.setdefault(tuple(sorted(key)), []).append(polygon.index)
    for key, faces in edge_faces.items():
        edge = edges_by_key.get(key)
        if edge is not None and not edge.use_seam and len(faces) == 2:
            adjacency[faces[0]].add(faces[1])
            adjacency[faces[1]].add(faces[0])
    count = 0
    while remaining:
        count += 1
        queue = [remaining.pop()]
        while queue:
            for neighbor in adjacency[queue.pop()]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    queue.append(neighbor)
    return count


def uv_face_area(polygon, layer):
    points = [layer.data[index].uv for index in polygon.loop_indices]
    return abs(sum(points[i].x * points[(i + 1) % len(points)].y - points[(i + 1) % len(points)].x * points[i].y for i in range(len(points))) * 0.5)


def uv_report(obj, density=None):
    mesh = obj.data
    layer = mesh.uv_layers.active
    diagnostics = []
    out_of_bounds = 0
    zero_area = 0
    area_sum = 0.0
    udim_tiles = set()
    densities = []
    if layer:
        for loop in layer.data:
            if loop.uv.x < 0 or loop.uv.y < 0 or loop.uv.x > 1 or loop.uv.y > 1:
                out_of_bounds += 1
            udim_tiles.add(1001 + math.floor(loop.uv.x) + 10 * math.floor(loop.uv.y))
        for polygon in mesh.polygons:
            area = uv_face_area(polygon, layer)
            area_sum += area
            if area <= 1.0e-12:
                zero_area += 1
            if density and polygon.area > 1.0e-12 and area > 0:
                pixels = math.sqrt(area * density["textureWidth"] * density["textureHeight"])
                world = math.sqrt(polygon.area)
                value = pixels / world
                if density["unit"] == "PX_PER_CM":
                    value /= 100.0
                densities.append(value)
    else:
        diagnostics.append({"code": "UV_LAYER_NOT_FOUND", "severity": "ERROR", "message": "Mesh has no active UV layer.", "approximate": False})
    if out_of_bounds:
        diagnostics.append({"code": "UV_OUT_OF_BOUNDS", "severity": "WARNING", "message": "UV coordinates exist outside the base tile.", "approximate": False})
    body = {
        "version": VERSION, "objectId": obj.get(IDENTITY_KEY), "layerCount": len(mesh.uv_layers),
        "activeLayer": layer.name if layer else None, "layers": [item.name for item in mesh.uv_layers],
        "islandCount": uv_islands(mesh) if layer else 0,
        "seamEdgeCount": sum(1 for edge in mesh.edges if edge.use_seam),
        "missingFaceCount": len(mesh.polygons) if not layer else 0, "zeroAreaFaceCount": zero_area,
        "outOfBoundsLoopCount": out_of_bounds, "overlapEstimate": None,
        "packingEfficiency": min(1.0, area_sum) if layer else None,
        "udimTiles": sorted(tile for tile in udim_tiles if tile > 0), "diagnostics": diagnostics,
    }
    if densities:
        body["density"] = {"unit": density["unit"], "minimum": min(densities), "maximum": max(densities), "mean": sum(densities) / len(densities)}
    body["fingerprint"] = fingerprint(body)
    return body


def principled(material):
    material.use_nodes = True
    node = next((item for item in material.node_tree.nodes if item.type == "BSDF_PRINCIPLED"), None)
    if node is None:
        raise ProfessionalFailure("MATERIAL_UNSUPPORTED_GRAPH", "Material has no supported Principled BSDF node.")
    return node


def pbr_report(material):
    node = principled(material)
    nodes = list(material.node_tree.nodes)
    unsupported = [item for item in nodes if item.type not in {"BSDF_PRINCIPLED", "OUTPUT_MATERIAL", "TEX_IMAGE", "NORMAL_MAP", "SEPARATE_COLOR", "COMBINE_COLOR", "MAPPING", "TEX_COORD"}]
    support = "PARTIAL" if unsupported else "LOSSLESS_SUPPORTED"
    diagnostics = []
    if unsupported:
        diagnostics.append({"code": "MATERIAL_UNSUPPORTED_GRAPH", "severity": "WARNING", "message": "Material graph contains unsupported nodes.", "approximate": False})
    channels = []
    socket_channels = {"Base Color": "BASE_COLOR", "Metallic": "METALLIC_ROUGHNESS", "Roughness": "METALLIC_ROUGHNESS", "Emission Color": "EMISSION"}
    for socket_name, channel in socket_channels.items():
        socket = node.inputs.get(socket_name)
        if socket and socket.is_linked:
            source = socket.links[0].from_node
            if source.type == "TEX_IMAGE" and source.image:
                channels.append({"channel": channel, "imageName": source.image.name, "colorSpace": source.image.colorspace_settings.name})
    normal_strength = None
    normal_socket = node.inputs.get("Normal")
    if normal_socket and normal_socket.is_linked and normal_socket.links[0].from_node.type == "NORMAL_MAP":
        normal_node = normal_socket.links[0].from_node
        normal_strength = float(normal_node.inputs["Strength"].default_value)
        color = normal_node.inputs.get("Color")
        if color and color.is_linked and color.links[0].from_node.type == "TEX_IMAGE" and color.links[0].from_node.image:
            image = color.links[0].from_node.image
            channels.append({"channel": "NORMAL", "imageName": image.name, "colorSpace": image.colorspace_settings.name})
            if image.colorspace_settings.name != "Non-Color":
                diagnostics.append({"code": "MATERIAL_VALUE_INVALID", "severity": "WARNING", "message": "Normal map is not configured as non-color data.", "approximate": False})
    value = lambda name, fallback: node.inputs[name].default_value if node.inputs.get(name) else fallback
    base = list(value("Base Color", (0.8, 0.8, 0.8, 1.0)))
    emission = list(value("Emission Color", (0.0, 0.0, 0.0, 1.0)))
    body = {
        "version": VERSION, "materialId": material.get(IDENTITY_KEY), "graphSupport": support,
        "baseColor": base, "metallic": float(value("Metallic", 0.0)), "roughness": float(value("Roughness", 0.5)),
        "alpha": float(value("Alpha", 1.0)), "emission": emission, "normalStrength": normal_strength,
        "textureChannels": sorted(channels, key=lambda item: (item["channel"], item["imageName"])), "diagnostics": diagnostics,
    }
    body["fingerprint"] = fingerprint(body)
    return body


def mesh_counts(obj):
    obj.data.calc_loop_triangles()
    return {"vertices": len(obj.data.vertices), "edges": len(obj.data.edges), "faces": len(obj.data.polygons), "triangles": len(obj.data.loop_triangles)}


def mapping(before, after, status, removed_vertices=None, removed_faces=None):
    return {
        "identityStatus": status, "sourceVertexCount": before["vertices"], "resultVertexCount": after["vertices"],
        "sourceFaceCount": before["faces"], "resultFaceCount": after["faces"],
        "removedVertexIndices": sorted(removed_vertices or []), "removedFaceIndices": sorted(removed_faces or []),
        "notes": [] if status == "PRESERVED" else ["Topology operations can invalidate stable element indices."],
    }


def enforce_output_budget(obj, budget):
    counts = mesh_counts(obj)
    limits = budget["professional"]
    if counts["vertices"] > limits["maxOutputVertices"] or counts["faces"] > limits["maxOutputFaces"]:
        raise ProfessionalFailure("MESH_OPERATION_BUDGET_EXCEEDED", "Mesh output exceeds the configured topology budget.")
    if len(obj.modifiers) > limits["maxModifiers"]:
        raise ProfessionalFailure("MESH_LIMIT_EXCEEDED", "Modifier count exceeds the configured budget.")
    return counts


def prepare_object_mode(obj):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def selected_edges(domain, elements):
    if domain == "EDGE":
        return list(elements)
    if domain == "FACE":
        return sorted({edge for face in elements for edge in face.edges}, key=lambda edge: edge.index)
    return sorted({edge for vertex in elements for edge in vertex.link_edges}, key=lambda edge: edge.index)


def execute_bmesh(operation, budget):
    obj = find_object(operation["objectId"])
    before = mesh_counts(obj)
    bm = bmesh_for(obj)
    kind = operation["kind"]
    domain, elements = select_elements(bm, operation["selection"], budget)
    removed_vertices, removed_faces = [], []
    identity = "PARTIAL"
    if kind == "mesh.extrude":
        if domain == "FACE":
            result = bmesh.ops.extrude_face_region(bm, geom=elements)
        elif domain == "EDGE":
            result = bmesh.ops.extrude_edge_only(bm, edges=elements)
        else:
            raise ProfessionalFailure("MESH_SELECTION_INVALID", "Extrude requires face or edge selection.")
        vertices = [item for item in result["geom"] if isinstance(item, bmesh.types.BMVert) and item not in elements]
        direction = Vector((operation["direction"]["x"], operation["direction"]["z"], -operation["direction"]["y"]))
        if direction.length == 0:
            raise ProfessionalFailure("MESH_OPERATION_INVALID", "Extrude direction cannot be zero.")
        direction.normalize()
        if operation["coordinateSpace"] == "WORLD":
            direction = obj.matrix_world.inverted().to_3x3() @ direction
        bmesh.ops.translate(bm, verts=vertices, vec=direction * operation["distance"])
    elif kind == "mesh.inset":
        if domain != "FACE":
            raise ProfessionalFailure("MESH_SELECTION_INVALID", "Inset requires face selection.")
        if operation["mode"] == "REGION":
            bmesh.ops.inset_region(bm, faces=elements, thickness=operation["amount"], depth=operation["depth"], use_even_offset=True)
        else:
            bmesh.ops.inset_individual(bm, faces=elements, thickness=operation["amount"], depth=operation["depth"], use_even_offset=True)
    elif kind == "mesh.bevel":
        geometry = elements if (domain == "VERTEX" and operation["affect"] == "VERTICES") else selected_edges(domain, elements)
        if not geometry:
            raise ProfessionalFailure("MESH_SELECTION_INVALID", "Bevel selection contains no applicable elements.")
        bmesh.ops.bevel(bm, geom=geometry, offset=operation["width"], segments=operation["segments"], profile=operation["profile"], affect=operation["affect"])
    elif kind == "mesh.subdivide":
        edges = selected_edges(domain, elements)
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=(2 ** operation["level"]) - 1, use_grid_fill=True)
    elif kind == "mesh.merge_vertices":
        vertices = elements if domain == "VERTEX" else sorted({vertex for item in elements for vertex in item.verts}, key=lambda vertex: vertex.index)
        if operation["strategy"] == "BY_DISTANCE":
            bmesh.ops.remove_doubles(bm, verts=vertices, dist=operation["distance"])
        else:
            target = vertices[0].co.copy() if operation["strategy"] == "FIRST" else sum((vertex.co for vertex in vertices), Vector()) / len(vertices)
            bmesh.ops.pointmerge(bm, verts=vertices, merge_co=target)
    elif kind.startswith("mesh.delete_"):
        contexts = {"mesh.delete_vertices": "VERTS", "mesh.delete_edges": "EDGES", "mesh.delete_faces": "FACES_ONLY"}
        removed_vertices = indices(elements) if domain == "VERTEX" else []
        removed_faces = indices(elements) if domain == "FACE" else []
        bmesh.ops.delete(bm, geom=elements, context=contexts[kind])
        identity = "DESTROYED"
    elif kind == "mesh.recalculate_normals":
        faces = elements if domain == "FACE" else sorted({face for item in elements for face in item.link_faces}, key=lambda face: face.index)
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        if operation["direction"] == "INSIDE":
            bmesh.ops.reverse_faces(bm, faces=faces)
        identity = "PRESERVED"
    elif kind == "mesh.flip_normals":
        faces = elements if domain == "FACE" else sorted({face for item in elements for face in item.link_faces}, key=lambda face: face.index)
        bmesh.ops.reverse_faces(bm, faces=faces)
        identity = "PRESERVED"
    elif kind == "topology.fill_holes":
        edges = selected_edges(domain, elements)
        bmesh.ops.holes_fill(bm, edges=edges, sides=operation["maxSides"])
    elif kind == "topology.triangulate":
        faces = elements if domain == "FACE" else sorted({face for item in elements for face in item.link_faces}, key=lambda face: face.index)
        bmesh.ops.triangulate(bm, faces=faces)
    elif kind == "topology.tris_to_quads":
        faces = elements if domain == "FACE" else sorted({face for item in elements for face in item.link_faces}, key=lambda face: face.index)
        bmesh.ops.join_triangles(bm, faces=faces, angle_face_threshold=operation["angleLimit"], angle_shape_threshold=operation["angleLimit"])
    else:
        bm.free()
        raise ProfessionalFailure("MESH_OPERATION_INVALID", "Unsupported BMesh operation.")
    commit_bmesh(obj, bm)
    after = enforce_output_budget(obj, budget)
    return {"before": before, "after": after, "mapping": mapping(before, after, identity, removed_vertices, removed_faces), "topology": topology_report(obj, "WEB_STATIC")}


def edit_uv(operation, budget):
    obj = find_object(operation["objectId"])
    prepare_object_mode(obj)
    kind = operation["kind"]
    if kind == "uv.create_layer":
        if obj.data.uv_layers.get(operation["name"]):
            raise ProfessionalFailure("MESH_OPERATION_INVALID", "UV layer already exists.")
        layer = obj.data.uv_layers.new(name=operation["name"], do_init=True)
        if operation["setActive"]:
            obj.data.uv_layers.active = layer
    elif kind in ("uv.delete_layer", "uv.set_active_layer"):
        layer = obj.data.uv_layers.get(operation["name"])
        if layer is None:
            raise ProfessionalFailure("UV_LAYER_NOT_FOUND", "Requested UV layer was not found.")
        if kind == "uv.delete_layer":
            obj.data.uv_layers.remove(layer)
        else:
            obj.data.uv_layers.active = layer
    elif kind in ("uv.mark_seam", "uv.clear_seams"):
        bm = bmesh_for(obj)
        domain, elements = select_elements(bm, operation["selection"], budget)
        for edge in selected_edges(domain, elements):
            edge.seam = kind == "uv.mark_seam"
        commit_bmesh(obj, bm)
    elif kind == "uv.unwrap":
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        bm = bmesh_for(obj)
        domain, elements = select_elements(bm, operation["selection"], budget)
        for item in elements:
            item.select = True
        commit_bmesh(obj, bm)
        bpy.ops.object.mode_set(mode="EDIT")
        if operation["method"] == "SMART_PROJECT":
            bpy.ops.uv.smart_project(island_margin=operation["margin"])
        else:
            bpy.ops.uv.unwrap(method=operation["method"], margin=operation["margin"])
        if operation["packAfter"]:
            bpy.ops.uv.select_all(action="SELECT")
            bpy.ops.uv.pack_islands(rotate=operation["rotate"], scale=operation["scaleToFit"], margin=operation["margin"])
        bpy.ops.object.mode_set(mode="OBJECT")
    elif kind == "uv.pack":
        if not obj.data.uv_layers.active:
            raise ProfessionalFailure("UV_LAYER_NOT_FOUND", "UV packing requires an active layer.")
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.pack_islands(rotate=operation["rotate"], scale=operation["scaleToFit"], margin=operation["margin"])
        bpy.ops.object.mode_set(mode="OBJECT")
    elif kind == "uv.transform":
        layer = obj.data.uv_layers.active
        if not layer:
            raise ProfessionalFailure("UV_LAYER_NOT_FOUND", "UV transform requires an active layer.")
        cosine, sine = math.cos(operation["rotation"]), math.sin(operation["rotation"])
        for loop in layer.data:
            x, y = loop.uv.x * operation["scale"]["x"], loop.uv.y * operation["scale"]["y"]
            loop.uv.x = x * cosine - y * sine + operation["translation"]["x"]
            loop.uv.y = x * sine + y * cosine + operation["translation"]["y"]
    else:
        raise ProfessionalFailure("MESH_OPERATION_INVALID", "Unsupported UV operation.")
    return uv_report(obj)


def modifier_operation(operation, budget):
    obj = find_object(operation["objectId"])
    prepare_object_mode(obj)
    before = mesh_counts(obj)
    kind = operation["kind"]
    if kind == "mesh.subdivide" and operation["mode"] == "NONDESTRUCTIVE_MODIFIER":
        modifier = obj.modifiers.new(name="AEVUM Subdivision", type="SUBSURF")
        modifier.levels = operation["level"]
        modifier.render_levels = operation["level"]
        status = "PRESERVED"
    elif kind == "mesh.solidify":
        modifier = obj.modifiers.new(name="AEVUM Solidify", type="SOLIDIFY")
        modifier.thickness, modifier.offset = operation["thickness"], operation["offset"]
        modifier.use_even_offset = operation["evenThickness"]
        if operation["apply"]:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        status = "PARTIAL"
    elif kind == "mesh.mirror":
        modifier = obj.modifiers.new(name="AEVUM Mirror", type="MIRROR")
        modifier.use_axis = [axis == operation["axis"] for axis in ("X", "Y", "Z")]
        modifier.use_clip = operation["merge"]
        modifier.merge_threshold = operation["mergeThreshold"]
        if operation["apply"]:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        status = "PARTIAL"
    elif kind == "topology.decimate":
        modifier = obj.modifiers.new(name="AEVUM Decimate", type="DECIMATE")
        modifier.ratio = operation["ratio"]
        modifier.use_collapse_triangulate = False
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        status = "DESTROYED"
    else:
        raise ProfessionalFailure("MESH_OPERATION_INVALID", "Unsupported controlled modifier operation.")
    after = enforce_output_budget(obj, budget)
    return {"before": before, "after": after, "mapping": mapping(before, after, status), "topology": topology_report(obj, "WEB_STATIC")}


def optimization_report(profile):
    targets = {
        "WEB_HERO_HIGH": (250000, 16, 32), "WEB_STANDARD": (100000, 8, 16),
        "WEB_MOBILE": (40000, 4, 8), "ARCHIVE_HIGH": (5000000, 256, 512),
    }
    triangles = 0
    vertices = 0
    draw_calls = 0
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            counts = mesh_counts(obj)
            triangles += counts["triangles"]
            vertices += counts["vertices"]
            draw_calls += max(1, len(obj.material_slots))
    max_triangles, max_materials, max_draw_calls = targets[profile]
    diagnostics = []
    if triangles > max_triangles or len(bpy.data.materials) > max_materials or draw_calls > max_draw_calls:
        diagnostics.append({"code": "OPTIMIZATION_TARGET_UNREACHABLE", "severity": "WARNING", "message": "Scene exceeds one or more profile targets.", "approximate": True})
    body = {"version": VERSION, "profile": profile, "triangles": triangles, "vertices": vertices, "materials": len(bpy.data.materials), "textures": len(bpy.data.images), "drawCallEstimate": draw_calls, "targets": {"maxTriangles": max_triangles, "maxMaterials": max_materials, "maxDrawCalls": max_draw_calls}, "diagnostics": diagnostics}
    body["fingerprint"] = fingerprint(body)
    return body


def execute_professional(operation, budget):
    kind = operation["kind"]
    if kind in ("mesh.topology_inspect", "mesh.validate"):
        report = topology_report(find_object(operation["objectId"]), operation["profile"])
        if kind == "mesh.validate":
            uv = uv_report(find_object(operation["objectId"])) if operation["requireUv"] else None
            missing_material = operation["requireMaterial"] and not find_object(operation["objectId"]).material_slots
            return {"valid": report["quality"] not in ("INVALID", "POOR") and not missing_material and (not uv or not uv["diagnostics"]), "topology": report, "uv": uv, "materialMissing": missing_material}
        return report
    if kind in {"mesh.extrude", "mesh.inset", "mesh.bevel", "mesh.merge_vertices", "mesh.delete_vertices", "mesh.delete_edges", "mesh.delete_faces", "mesh.recalculate_normals", "mesh.flip_normals", "topology.fill_holes", "topology.triangulate", "topology.tris_to_quads"}:
        return execute_bmesh(operation, budget)
    if kind == "mesh.loop_cut":
        obj = find_object(operation["objectId"])
        bm = bmesh_for(obj)
        edge = validate_indices(bm.edges, [operation["edgeIndex"]])[0]
        ring = {edge}
        queue = [edge]
        while queue:
            current = queue.pop(0)
            for face in current.link_faces:
                if len(face.edges) == 4:
                    opposite = next(candidate for candidate in face.edges if not set(candidate.verts) & set(current.verts))
                    if opposite not in ring:
                        ring.add(opposite)
                        queue.append(opposite)
        before = mesh_counts(obj)
        bmesh.ops.subdivide_edges(bm, edges=list(ring), cuts=operation["cutCount"], edge_percents={item: 0.5 + operation["factor"] * 0.5 for item in ring})
        commit_bmesh(obj, bm)
        after = enforce_output_budget(obj, budget)
        return {"before": before, "after": after, "mapping": mapping(before, after, "PARTIAL"), "topology": topology_report(obj, "WEB_STATIC")}
    if kind in {"mesh.subdivide", "mesh.solidify", "mesh.mirror", "topology.decimate"}:
        if kind == "mesh.subdivide" and operation["mode"] == "APPLIED_TOPOLOGY":
            return execute_bmesh(operation, budget)
        return modifier_operation(operation, budget)
    if kind == "topology.remesh":
        obj = find_object(operation["objectId"])
        prepare_object_mode(obj)
        before = mesh_counts(obj)
        obj.data.remesh_voxel_size = operation["voxelSize"]
        obj.data.remesh_voxel_adaptivity = 0.0
        bpy.ops.object.voxel_remesh()
        after = enforce_output_budget(obj, budget)
        return {"before": before, "after": after, "mapping": mapping(before, after, "DESTROYED"), "topology": topology_report(obj, "WEB_STATIC")}
    if kind == "topology.delete_loose":
        obj = find_object(operation["objectId"])
        bm = bmesh_for(obj)
        before = mesh_counts(obj)
        loose_edges = [edge for edge in bm.edges if not edge.link_faces]
        if loose_edges:
            bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
        loose_vertices = [vertex for vertex in bm.verts if not vertex.link_edges]
        if loose_vertices:
            bmesh.ops.delete(bm, geom=loose_vertices, context="VERTS")
        commit_bmesh(obj, bm)
        after = enforce_output_budget(obj, budget)
        return {"before": before, "after": after, "mapping": mapping(before, after, "DESTROYED"), "topology": topology_report(obj, "WEB_STATIC")}
    if kind == "mesh.set_shading":
        obj = find_object(operation["objectId"])
        bm = bmesh_for(obj)
        domain, elements = select_elements(bm, operation["selection"], budget)
        faces = elements if domain == "FACE" else sorted({face for item in elements for face in item.link_faces}, key=lambda face: face.index)
        for face in faces:
            face.smooth = operation["shading"] == "SMOOTH"
        commit_bmesh(obj, bm)
        return {"shading": operation["shading"], "faceCount": len(faces)}
    if kind in ("mesh.set_origin", "mesh.set_pivot"):
        obj = find_object(operation["objectId"])
        prepare_object_mode(obj)
        if kind == "mesh.set_pivot" or operation["mode"] == "CURSOR":
            value = operation.get("position") or operation.get("cursor")
            if value is None:
                raise ProfessionalFailure("MESH_OPERATION_INVALID", "Cursor origin requires an explicit position.")
            bpy.context.scene.cursor.location = Vector((value["x"], value["z"], -value["y"]))
            bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        else:
            bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY" if operation["mode"] == "GEOMETRY" else "ORIGIN_CENTER_OF_MASS")
        return {"objectId": operation["objectId"], "originUpdated": True}
    if kind == "mesh.join":
        target = find_object(operation["objectId"])
        sources = [find_object(entity_id) for entity_id in operation["sourceObjectIds"]]
        prepare_object_mode(target)
        for source in sources:
            source.select_set(True)
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.join()
        return {"objectId": operation["objectId"], "joinedEntityIds": operation["sourceObjectIds"], "topology": topology_report(target, "WEB_STATIC")}
    if kind == "mesh.separate":
        obj = find_object(operation["objectId"])
        if operation["policy"] == "SELECTED_FACES":
            bm = bmesh_for(obj)
            domain, elements = select_elements(bm, operation["selection"], budget)
            faces = elements if domain == "FACE" else sorted(
                {face for item in elements for face in item.link_faces}, key=lambda face: face.index
            )
            if not faces:
                bm.free()
                raise ProfessionalFailure("MESH_SELECTION_INVALID", "Selected-face separation requires at least one face.")
            for face in bm.faces:
                face.select = face in faces
            commit_bmesh(obj, bm)
        prepare_object_mode(obj)
        bpy.ops.object.mode_set(mode="EDIT")
        if operation["policy"] != "SELECTED_FACES":
            bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type={"BY_MATERIAL": "MATERIAL", "LOOSE_PARTS": "LOOSE", "SELECTED_FACES": "SELECTED"}[operation["policy"]])
        bpy.ops.object.mode_set(mode="OBJECT")
        created = sorted([item for item in bpy.context.selected_objects if item != obj], key=lambda item: item.name)
        if len(created) > len(operation["newEntityIds"]):
            raise ProfessionalFailure("MESH_LIMIT_EXCEEDED", "Separation produced more objects than authorized identities.")
        for item, entity_id in zip(created, operation["newEntityIds"]):
            item[IDENTITY_KEY] = entity_id
        return {"objectId": operation["objectId"], "newEntityIds": [item.get(IDENTITY_KEY) for item in created]}
    if kind.startswith("uv.") and kind not in ("uv.inspect", "uv.texel_density", "uv.udim_inspect"):
        return edit_uv(operation, budget)
    if kind == "uv.inspect" or kind == "uv.udim_inspect":
        return uv_report(find_object(operation["objectId"]))
    if kind == "uv.texel_density":
        return uv_report(find_object(operation["objectId"]), operation)
    if kind == "material.validate_pbr":
        return pbr_report(find_material(operation["materialId"]))
    if kind == "optimization.analyze":
        return optimization_report(operation["profile"])
    if kind == "optimization.generate_lod":
        source = find_object(operation["objectId"])
        source_metrics = mesh_counts(source)
        source_materials = [slot.material.get(IDENTITY_KEY) or slot.material.name for slot in source.material_slots if slot.material]
        duplicate = source.copy()
        duplicate.data = source.data.copy()
        duplicate[IDENTITY_KEY] = operation["newEntityId"]
        duplicate.name = source.name + " " + operation["level"]
        bpy.context.scene.collection.objects.link(duplicate)
        prepare_object_mode(duplicate)
        modifier = duplicate.modifiers.new(name="AEVUM LOD", type="DECIMATE")
        modifier.ratio = operation["ratio"]
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        return {"sourceObjectId": operation["objectId"], "newEntityId": operation["newEntityId"], "level": operation["level"], "ratio": operation["ratio"], "sourceMetrics": source_metrics, "metrics": mesh_counts(duplicate), "sourceMaterials": source_materials, "materials": [slot.material.get(IDENTITY_KEY) or slot.material.name for slot in duplicate.material_slots if slot.material], "topology": topology_report(duplicate, "WEB_STATIC")}
    raise ProfessionalFailure("MESH_OPERATION_INVALID", "Professional operation is not implemented.")
