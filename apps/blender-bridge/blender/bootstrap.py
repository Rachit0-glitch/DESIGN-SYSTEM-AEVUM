import bpy
import json
import math
from mathutils import Matrix, Quaternion, Vector
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from professional import ProfessionalFailure, SUPPORTED_PROFESSIONAL, execute_professional
from rigging import RiggingFailure, SUPPORTED_RIGGING, execute_rigging

PROTOCOL_VERSION = "1.0.0"
IDENTITY_KEY = "aevum.entity_id"
RIG_FINGERPRINT_KEY = "aevum.rig_fingerprint"
SUPPORTED = {
    "scene.inspect", "scene.import_gltf", "scene.export_glb", "scene.validate",
    "object.inspect", "object.transform", "object.duplicate", "object.delete",
    "mesh.inspect", "material.inspect", "material.update_pbr",
    "camera.inspect", "camera.update", "camera.activate",
    "light.inspect", "light.update", "bridge.test_delay",
} | SUPPORTED_PROFESSIONAL | SUPPORTED_RIGGING
C = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)))
C_INV = C.inverted()


class BridgeFailure(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def arguments():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    values = {}
    for index in range(0, len(args), 2):
        if index + 1 < len(args):
            values[args[index]] = args[index + 1]
    if "--manifest" not in values or "--result" not in values:
        raise BridgeFailure("BLENDER_JOB_INVALID", "Controlled manifest and result paths are required.")
    return values


def finite(values):
    return all(math.isfinite(float(value)) for value in values)


def vector_to_blender(value):
    return C @ Vector((value["x"], value["y"], value["z"]))


def vector_to_aevum(value):
    result = C_INV @ Vector(value)
    return {"x": result.x, "y": result.y, "z": result.z}


def quaternion_to_blender(value):
    source = Quaternion((value["w"], value["x"], value["y"], value["z"]))
    converted = C @ source.to_matrix() @ C_INV
    return converted.to_quaternion()


def quaternion_to_aevum(value):
    converted = C_INV @ value.to_matrix() @ C
    result = converted.to_quaternion()
    return {"x": result.x, "y": result.y, "z": result.z, "w": result.w}


def transform_record(obj, world=False):
    matrix = obj.matrix_world if world else obj.matrix_local
    location, rotation, scale = matrix.decompose()
    return {
        "position": vector_to_aevum(location),
        "quaternion": quaternion_to_aevum(rotation),
        "scale": {"x": scale.x, "y": scale.z, "z": scale.y},
    }


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def import_scene(source):
    clear_scene()
    if not os.path.isfile(source):
        raise BridgeFailure("BLENDER_INPUT_INVALID", "Authorized input artifact is missing.")
    try:
        bpy.ops.import_scene.gltf(filepath=source)
    except Exception as error:
        raise BridgeFailure("BLENDER_INPUT_INVALID", "Blender could not import the authorized glTF input.") from error


def collection_for(kind):
    if kind == "OBJECT":
        return bpy.data.objects
    if kind == "MATERIAL":
        return bpy.data.materials
    if kind == "CAMERA":
        return bpy.data.cameras
    if kind == "LIGHT":
        return bpy.data.lights
    raise BridgeFailure("BLENDER_JOB_INVALID", "Identity binding kind is invalid.")


def apply_identity_bindings(bindings):
    for binding in bindings:
        collection = collection_for(binding["kind"])
        source_fingerprint = binding.get("sourceFingerprint")
        if source_fingerprint:
            matches = [value for value in collection if value.get(RIG_FINGERPRINT_KEY) == source_fingerprint]
            if len(matches) > 1:
                raise BridgeFailure("BLENDER_IDENTITY_AMBIGUOUS", "Stable rig identity matched more than one object.")
            target = matches[0] if matches else None
        else:
            target = collection.get(binding["sourceName"])
        if target is None and binding["kind"] in ("CAMERA", "LIGHT"):
            source_object = bpy.data.objects.get(binding["sourceName"])
            target = source_object.data if source_object and source_object.data in collection.values() else None
        if target is not None:
            target[IDENTITY_KEY] = binding["entityId"]
            if binding["kind"] in ("CAMERA", "LIGHT"):
                for obj in bpy.data.objects:
                    if obj.data == target:
                        obj[IDENTITY_KEY] = binding["entityId"]


def find_entity(collection, entity_id, code):
    for value in collection:
        if value.get(IDENTITY_KEY) == entity_id:
            return value
    direct = collection.get(entity_id)
    if direct is not None:
        return direct
    raise BridgeFailure(code, "Requested Blender entity was not found.")


def find_object(entity_id):
    return find_entity(bpy.data.objects, entity_id, "BLENDER_OBJECT_NOT_FOUND")


def object_record(obj):
    return {
        "entityId": obj.get(IDENTITY_KEY),
        "name": obj.name,
        "type": obj.type,
        "parentEntityId": obj.parent.get(IDENTITY_KEY) if obj.parent else None,
        "parentName": obj.parent.name if obj.parent else None,
        "children": [child.get(IDENTITY_KEY) or child.name for child in sorted(obj.children, key=lambda item: item.name)],
        "localTransform": transform_record(obj),
        "worldTransform": transform_record(obj, True),
        "visible": not obj.hide_render,
    }


def mesh_record(obj):
    if obj.type != "MESH" or obj.data is None:
        raise BridgeFailure("BLENDER_INPUT_INVALID", "Requested object does not contain mesh data.")
    mesh = obj.data
    mesh.calc_loop_triangles()
    bounds = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return {
        "object": object_record(obj),
        "vertexCount": len(mesh.vertices),
        "edgeCount": len(mesh.edges),
        "faceCount": len(mesh.polygons),
        "triangleCount": len(mesh.loop_triangles),
        "uvLayers": [layer.name for layer in mesh.uv_layers],
        "colorAttributes": [attribute.name for attribute in mesh.color_attributes],
        "shapeKeys": [key.name for key in mesh.shape_keys.key_blocks] if mesh.shape_keys else [],
        "materials": [slot.material.get(IDENTITY_KEY) or slot.material.name for slot in obj.material_slots if slot.material],
        "modifiers": [modifier.type for modifier in obj.modifiers],
        "bounds": {
            "min": vector_to_aevum((min(value.x for value in bounds), min(value.y for value in bounds), min(value.z for value in bounds))),
            "max": vector_to_aevum((max(value.x for value in bounds), max(value.y for value in bounds), max(value.z for value in bounds))),
        },
    }


def principled(material):
    material.use_nodes = True
    node = next((item for item in material.node_tree.nodes if item.type == "BSDF_PRINCIPLED"), None)
    if node is None:
        raise BridgeFailure("BLENDER_MATERIAL_NOT_FOUND", "Material has no supported Principled BSDF node.")
    return node


def input_value(node, name, fallback=None):
    socket = node.inputs.get(name)
    return socket.default_value if socket is not None else fallback


def material_record(material):
    node = principled(material)
    base = input_value(node, "Base Color", (0.8, 0.8, 0.8, 1.0))
    emission = input_value(node, "Emission Color", input_value(node, "Emission", (0.0, 0.0, 0.0, 1.0)))
    return {
        "entityId": material.get(IDENTITY_KEY),
        "name": material.name,
        "baseColor": list(base),
        "metallic": float(input_value(node, "Metallic", 0.0)),
        "roughness": float(input_value(node, "Roughness", 0.5)),
        "alpha": float(input_value(node, "Alpha", 1.0)),
        "emission": list(emission),
        "blendMethod": material.surface_render_method if hasattr(material, "surface_render_method") else "DITHERED",
    }


def camera_object(entity_id):
    data = find_entity(bpy.data.cameras, entity_id, "BLENDER_CAMERA_NOT_FOUND")
    obj = next((item for item in bpy.data.objects if item.data == data), None)
    if obj is None:
        raise BridgeFailure("BLENDER_CAMERA_NOT_FOUND", "Camera has no scene object.")
    return obj


def camera_record(obj):
    camera = obj.data
    return {
        "entityId": camera.get(IDENTITY_KEY) or obj.get(IDENTITY_KEY),
        "name": camera.name,
        "transform": transform_record(obj, True),
        "projection": "ORTHOGRAPHIC" if camera.type == "ORTHO" else "PERSPECTIVE",
        "focalLength": camera.lens,
        "fieldOfView": camera.angle_y,
        "nearClip": camera.clip_start,
        "farClip": camera.clip_end,
        "active": bpy.context.scene.camera == obj,
    }


def light_object(entity_id):
    data = find_entity(bpy.data.lights, entity_id, "BLENDER_LIGHT_NOT_FOUND")
    obj = next((item for item in bpy.data.objects if item.data == data), None)
    if obj is None:
        raise BridgeFailure("BLENDER_LIGHT_NOT_FOUND", "Light has no scene object.")
    return obj


def light_record(obj):
    light = obj.data
    kind = {"SUN": "DIRECTIONAL", "POINT": "POINT", "SPOT": "SPOT"}.get(light.type, light.type)
    return {
        "entityId": light.get(IDENTITY_KEY) or obj.get(IDENTITY_KEY),
        "name": light.name,
        "type": kind,
        "transform": transform_record(obj, True),
        "color": list(light.color),
        "intensity": light.energy,
        "range": light.cutoff_distance if hasattr(light, "cutoff_distance") else None,
        "spotSize": light.spot_size if light.type == "SPOT" else None,
        "spotBlend": light.spot_blend if light.type == "SPOT" else None,
    }


def scene_bounds():
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.bound_box:
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        return None
    return {
        "min": vector_to_aevum((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))),
        "max": vector_to_aevum((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points))),
    }


def scene_record():
    objects = sorted(bpy.context.scene.objects, key=lambda item: (item.name, item.type))
    return {
        "name": bpy.context.scene.name,
        "objectCount": len(objects),
        "meshCount": sum(1 for obj in objects if obj.type == "MESH"),
        "materialCount": len(bpy.data.materials),
        "cameraCount": sum(1 for obj in objects if obj.type == "CAMERA"),
        "lightCount": sum(1 for obj in objects if obj.type == "LIGHT"),
        "activeCamera": bpy.context.scene.camera.get(IDENTITY_KEY) if bpy.context.scene.camera else None,
        "objects": [object_record(obj) for obj in objects],
        "bounds": scene_bounds(),
        "collections": sorted(collection.name for collection in bpy.data.collections),
    }


def validate_scene(require_camera, budget):
    issues = []
    objects = list(bpy.context.scene.objects)
    if len(objects) > budget["maxObjects"]:
        issues.append({"code": "BLENDER_RESOURCE_LIMIT", "message": "Object count exceeds the job budget."})
    if sum(1 for obj in objects if obj.type == "MESH") > budget["maxMeshes"]:
        issues.append({"code": "BLENDER_RESOURCE_LIMIT", "message": "Mesh count exceeds the job budget."})
    if len(bpy.data.materials) > budget["maxMaterials"]:
        issues.append({"code": "BLENDER_RESOURCE_LIMIT", "message": "Material count exceeds the job budget."})
    for obj in objects:
        values = list(obj.location) + list(obj.rotation_euler) + list(obj.scale)
        if not finite(values):
            issues.append({"code": "BLENDER_SCENE_INVALID", "message": "Object has a non-finite transform.", "object": obj.name})
        if obj.type == "MESH" and obj.data is None:
            issues.append({"code": "BLENDER_SCENE_INVALID", "message": "Mesh object has no mesh data.", "object": obj.name})
        if obj.type == "MESH" and obj.data is not None:
            if len(obj.data.vertices) > budget["professional"]["maxOutputVertices"]:
                issues.append({"code": "MESH_LIMIT_EXCEEDED", "message": "Mesh vertex count exceeds the professional budget.", "object": obj.name})
            if len(obj.data.polygons) > budget["professional"]["maxOutputFaces"]:
                issues.append({"code": "MESH_LIMIT_EXCEEDED", "message": "Mesh face count exceeds the professional budget.", "object": obj.name})
    if require_camera and bpy.context.scene.camera is None:
        issues.append({"code": "BLENDER_SCENE_INVALID", "message": "Scene has no active camera."})
    return {"valid": len(issues) == 0, "issues": issues, "scene": scene_record()}


def set_transform(obj, operation):
    mode = operation["mode"]
    world = operation["coordinateSpace"] == "WORLD"
    if "translation" in operation:
        value = vector_to_blender(operation["translation"])
        if world:
            matrix = obj.matrix_world.copy()
            matrix.translation = matrix.translation + value if mode == "DELTA" else value
            obj.matrix_world = matrix
        else:
            obj.location = obj.location + value if mode == "DELTA" else value
    if "rotation" in operation:
        value = quaternion_to_blender(operation["rotation"])
        obj.rotation_mode = "QUATERNION"
        if world:
            location, current, scale = obj.matrix_world.decompose()
            rotation = current @ value if mode == "DELTA" else value
            obj.matrix_world = Matrix.LocRotScale(location, rotation, scale)
        else:
            obj.rotation_quaternion = obj.rotation_quaternion @ value if mode == "DELTA" else value
    if "scale" in operation:
        source = operation["scale"]
        value = Vector((source["x"], source["z"], source["y"]))
        if world:
            location, rotation, current = obj.matrix_world.decompose()
            scale = Vector((current.x * value.x, current.y * value.y, current.z * value.z)) if mode == "DELTA" else value
            obj.matrix_world = Matrix.LocRotScale(location, rotation, scale)
        else:
            obj.scale = Vector((obj.scale.x * value.x, obj.scale.y * value.y, obj.scale.z * value.z)) if mode == "DELTA" else value
    bpy.context.view_layer.update()
    return object_record(obj)


def look_at(obj, target):
    direction = vector_to_blender(target) - obj.matrix_world.translation
    if direction.length == 0:
        raise BridgeFailure("BLENDER_INPUT_INVALID", "Camera target cannot equal camera position.")
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def execute(operation, budget):
    kind = operation["kind"]
    if kind in SUPPORTED_PROFESSIONAL:
        return execute_professional(operation, budget)
    if kind in SUPPORTED_RIGGING:
        return execute_rigging(operation)
    if kind in ("scene.inspect", "scene.import_gltf"):
        return scene_record()
    if kind == "scene.validate":
        return validate_scene(operation["requireCamera"], budget)
    if kind == "scene.export_glb":
        return {"ready": validate_scene(False, budget)["valid"]}
    if kind == "object.inspect":
        return object_record(find_object(operation["objectId"]))
    if kind == "mesh.inspect":
        return mesh_record(find_object(operation["objectId"]))
    if kind == "object.transform":
        return set_transform(find_object(operation["objectId"]), operation)
    if kind == "object.duplicate":
        source = find_object(operation["objectId"])
        duplicate = source.copy()
        if source.data:
            duplicate.data = source.data.copy()
        duplicate[IDENTITY_KEY] = operation["newEntityId"]
        duplicate.name = source.name + " Copy"
        bpy.context.scene.collection.objects.link(duplicate)
        duplicate.parent = source.parent if operation["parentPolicy"] == "SAME_PARENT" else None
        duplicate.matrix_world = source.matrix_world.copy()
        return object_record(duplicate)
    if kind == "object.delete":
        target = find_object(operation["objectId"])
        children = list(target.children)
        if operation["childPolicy"] == "DELETE_CHILDREN":
            for child in children:
                bpy.data.objects.remove(child, do_unlink=True)
        else:
            for child in children:
                world = child.matrix_world.copy()
                child.parent = target.parent
                child.matrix_world = world
        name = target.name
        bpy.data.objects.remove(target, do_unlink=True)
        return {"deleted": operation["objectId"], "name": name}
    if kind == "material.inspect":
        return material_record(find_entity(bpy.data.materials, operation["materialId"], "BLENDER_MATERIAL_NOT_FOUND"))
    if kind == "material.update_pbr":
        material = find_entity(bpy.data.materials, operation["materialId"], "BLENDER_MATERIAL_NOT_FOUND")
        node = principled(material)
        mapping = {"baseColor": "Base Color", "metallic": "Metallic", "roughness": "Roughness", "alpha": "Alpha"}
        for key, socket_name in mapping.items():
            if key in operation and node.inputs.get(socket_name) is not None:
                node.inputs[socket_name].default_value = operation[key]
        if "emission" in operation:
            socket = node.inputs.get("Emission Color") or node.inputs.get("Emission")
            if socket is not None:
                socket.default_value = operation["emission"]
        if "normalStrength" in operation:
            normal_socket = node.inputs.get("Normal")
            if normal_socket and normal_socket.is_linked and normal_socket.links[0].from_node.type == "NORMAL_MAP":
                normal_socket.links[0].from_node.inputs["Strength"].default_value = operation["normalStrength"]
        return material_record(material)
    if kind == "camera.inspect":
        return camera_record(camera_object(operation["cameraId"]))
    if kind in ("camera.update", "camera.activate"):
        obj = camera_object(operation["cameraId"])
        if kind == "camera.activate":
            bpy.context.scene.camera = obj
            return camera_record(obj)
        if "position" in operation:
            obj.matrix_world.translation = vector_to_blender(operation["position"])
        if "rotation" in operation:
            location, _, scale = obj.matrix_world.decompose()
            obj.matrix_world = Matrix.LocRotScale(location, quaternion_to_blender(operation["rotation"]), scale)
        if "target" in operation:
            look_at(obj, operation["target"])
        if "focalLength" in operation:
            obj.data.lens = operation["focalLength"]
        if "fieldOfView" in operation:
            obj.data.angle_y = operation["fieldOfView"]
        if "nearClip" in operation:
            obj.data.clip_start = operation["nearClip"]
        if "farClip" in operation:
            obj.data.clip_end = operation["farClip"]
        return camera_record(obj)
    if kind == "light.inspect":
        return light_record(light_object(operation["lightId"]))
    if kind == "light.update":
        obj = light_object(operation["lightId"])
        if "position" in operation:
            obj.matrix_world.translation = vector_to_blender(operation["position"])
        if "rotation" in operation:
            location, _, scale = obj.matrix_world.decompose()
            obj.matrix_world = Matrix.LocRotScale(location, quaternion_to_blender(operation["rotation"]), scale)
        if "color" in operation:
            obj.data.color = operation["color"]
        if "intensity" in operation:
            obj.data.energy = operation["intensity"]
        if "range" in operation and hasattr(obj.data, "cutoff_distance"):
            obj.data.cutoff_distance = operation["range"]
        if obj.data.type == "SPOT" and "spotSize" in operation:
            obj.data.spot_size = operation["spotSize"]
        if obj.data.type == "SPOT" and "spotBlend" in operation:
            obj.data.spot_blend = operation["spotBlend"]
        return light_record(obj)
    if kind == "bridge.test_delay":
        time.sleep(operation["durationMs"] / 1000.0)
        return {"delayedMs": operation["durationMs"]}
    raise BridgeFailure("BLENDER_OPERATION_UNSUPPORTED", "Operation is not registered by this bridge runtime.")


def export_glb(output):
    try:
        bpy.ops.export_scene.gltf(
            filepath=output,
            export_format="GLB",
            export_extras=True,
            export_cameras=True,
            export_lights=True,
            export_animations=True,
        )
    except Exception as error:
        raise BridgeFailure("BLENDER_EXPORT_FAILED", "Blender failed to export the controlled GLB artifact.") from error
    if not os.path.isfile(output):
        raise BridgeFailure("BLENDER_OUTPUT_MISSING", "Blender reported success without a GLB artifact.")


def main():
    values = arguments()
    result_path = os.path.abspath(values["--result"])
    manifest_path = os.path.abspath(values["--manifest"])
    started = time.time()
    job_id = "unknown"
    operation_kind = "scene.inspect"
    try:
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        if manifest.get("protocolVersion") != PROTOCOL_VERSION:
            raise BridgeFailure("BLENDER_JOB_INVALID", "Unsupported bridge protocol version.")
        job_id = manifest["jobId"]
        operation = manifest["operation"]
        operation_kind = operation.get("kind", "")
        if operation_kind not in SUPPORTED:
            raise BridgeFailure("BLENDER_OPERATION_UNSUPPORTED", "Operation is not registered by this bridge runtime.")
        import_scene(manifest["inputPath"])
        apply_identity_bindings(manifest["identityBindings"])
        data = execute(operation, manifest["resourceBudget"])
        validation = validate_scene(False, manifest["resourceBudget"])
        if not validation["valid"]:
            raise BridgeFailure("BLENDER_SCENE_INVALID", "Scene failed controlled post-operation validation.")
        if manifest["expectedOutputs"]["glb"]:
            export_glb(manifest["outputPath"])
        result = {
            "protocolVersion": PROTOCOL_VERSION,
            "jobId": job_id,
            "state": "SUCCEEDED",
            "operation": operation_kind,
            "data": data,
            "diagnostics": [],
            "durationMs": int((time.time() - started) * 1000),
        }
    except (BridgeFailure, ProfessionalFailure, RiggingFailure) as error:
        result = {
            "protocolVersion": PROTOCOL_VERSION,
            "jobId": job_id,
            "state": "FAILED",
            "operation": operation_kind,
            "diagnostics": [{"code": error.code, "severity": "ERROR", "message": str(error), "recoverable": False}],
            "durationMs": int((time.time() - started) * 1000),
        }
    except Exception:
        result = {
            "protocolVersion": PROTOCOL_VERSION,
            "jobId": job_id,
            "state": "FAILED",
            "operation": operation_kind,
            "diagnostics": [{"code": "BLENDER_PROCESS_FAILED", "severity": "ERROR", "message": "Controlled Blender operation failed.", "recoverable": False}],
            "durationMs": int((time.time() - started) * 1000),
        }
    with open(result_path, "x", encoding="utf-8") as handle:
        json.dump(result, handle, sort_keys=True, separators=(",", ":"), allow_nan=False)
    if result["state"] != "SUCCEEDED":
        sys.exit(2)


main()
