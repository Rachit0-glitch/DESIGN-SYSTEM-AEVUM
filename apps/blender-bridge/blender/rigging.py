import bpy
import hashlib
import json
from mathutils import Matrix, Quaternion, Vector
import math

IDENTITY_KEY = "aevum.entity_id"
RIG_FINGERPRINT_KEY = "aevum.rig_fingerprint"
VERSION = "1.0.0"
AEVUM_TO_BLENDER = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, 1.0), (0.0, -1.0, 0.0)))

SUPPORTED_RIGGING = {
    "rig.create", "rig.inspect", "skin.bind", "skin.inspect",
    "pose.inspect", "pose.update", "pose.reset", "ik.update", "constraint.update",
    "skin.weight_update", "skin.weight_normalize", "deformation.validate",
}


class RiggingFailure(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def fingerprint(value):
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def to_blender_vec(value):
    return Vector((value["x"], value["z"], -value["y"]))


def to_aevum_vec(value):
    if not hasattr(value, "x"):
        value = Vector(value)
    return {"x": value.x, "y": -value.z, "z": value.y}


def to_blender_quat(value):
    source = Quaternion((value["w"], value["x"], value["y"], value["z"]))
    conversion = Quaternion((0.7071067811865476, 0.7071067811865476, 0.0, 0.0))
    return conversion @ source @ conversion.inverted()


def to_aevum_quat(value):
    conversion = Quaternion((0.7071067811865476, 0.7071067811865476, 0.0, 0.0))
    result = conversion.inverted() @ value @ conversion
    return {"x": result.x, "y": result.y, "z": result.z, "w": result.w}


def matrix_to_aevum_array(value):
    conversion = AEVUM_TO_BLENDER.to_4x4()
    result = conversion.inverted() @ value @ conversion
    return [result[row][column] for column in range(4) for row in range(4)]


def find_object(entity_id):
    for obj in bpy.data.objects:
        if obj.get(IDENTITY_KEY) == entity_id:
            return obj
    raise RiggingFailure("BLENDER_OBJECT_NOT_FOUND", "Requested object was not found.")


def find_armature(entity_id):
    obj = find_object(entity_id)
    if obj.type != "ARMATURE":
        raise RiggingFailure("RIG_BONE_MISSING", "Requested object is not an armature.")
    return obj


def prepare_object_mode(obj):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def rig_inspect_data(armature_obj):
    bones = []
    for bone in armature_obj.data.bones:
        bones.append(
            {
                "key": bone.name,
                "parentKey": bone.parent.name if bone.parent else None,
                "head": to_aevum_vec(bone.head_local),
                "tail": to_aevum_vec(bone.tail_local),
                "length": bone.length,
                "deforming": bone.use_deform,
            }
        )
    body = {
        "version": VERSION,
        "objectId": armature_obj.get(IDENTITY_KEY),
        "boneCount": len(bones),
        "bones": sorted(bones, key=lambda entry: entry["key"]),
    }
    body["fingerprint"] = fingerprint(body)
    return body


def create_rig(operation):
    target = find_object(operation["objectId"])
    name = operation.get("name") or "AEVUM_Rig"
    armature_data = bpy.data.armatures.new(name)
    armature_obj = bpy.data.objects.new(name, armature_data)
    bpy.context.scene.collection.objects.link(armature_obj)
    # The canonical rig is owned by the target node, but Blender's deformation relationship is
    # mesh -> armature. Keep the armature beside the target until binding so ARMATURE_AUTO can
    # establish that relationship without creating a mesh/armature parent cycle.
    armature_obj.parent = target.parent
    armature_obj.matrix_world = target.matrix_world.copy()
    armature_obj[RIG_FINGERPRINT_KEY] = fingerprint(operation)
    prepare_object_mode(armature_obj)
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = armature_data.edit_bones
    created = {}
    try:
        for spec in operation["bones"]:
            if spec["key"] in created:
                raise RiggingFailure("RIG_HIERARCHY_INVALID", f"Bone key '{spec['key']}' is declared more than once.")
            bone = edit_bones.new(spec["key"])
            bone.head = to_blender_vec(spec["head"])
            bone.tail = to_blender_vec(spec["tail"])
            if (bone.tail - bone.head).length <= 1.0e-6:
                raise RiggingFailure("RIG_REST_POSE_INVALID", f"Bone '{spec['key']}' has a degenerate (zero-length) rest transform.")
            bone.use_deform = spec["deforming"]
            if spec["parentKey"] is not None:
                parent_bone = created.get(spec["parentKey"])
                if parent_bone is None:
                    raise RiggingFailure("RIG_DANGLING_REFERENCE", f"Bone '{spec['key']}' references a parent that was not created first.")
                bone.parent = parent_bone
            created[spec["key"]] = bone
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
    if len(created) != len(operation["bones"]):
        raise RiggingFailure("RIG_HIERARCHY_INVALID", "Not every requested bone was created.")
    return rig_inspect_data(armature_obj)


def skin_report(mesh_obj, armature_obj):
    sums = []
    max_influences = 0
    unweighted = 0
    invalid = 0
    for vertex in mesh_obj.data.vertices:
        positive = [group.weight for group in vertex.groups if group.weight > 0]
        if not positive:
            unweighted += 1
            sums.append(0.0)
            continue
        max_influences = max(max_influences, len(positive))
        total = sum(positive)
        sums.append(total)
        if any(not isinstance(weight, (int, float)) or weight < 0 for weight in positive):
            invalid += 1
    normalized = unweighted == 0 and invalid == 0 and all(abs(total - 1.0) <= 1.0e-4 for total in sums)
    body = {
        "version": VERSION,
        "meshObjectId": mesh_obj.get(IDENTITY_KEY),
        "bound": armature_obj is not None,
        "rigObjectId": armature_obj.get(IDENTITY_KEY) if armature_obj is not None else None,
        "vertexGroupCount": len(mesh_obj.vertex_groups),
        "vertexCount": len(mesh_obj.data.vertices),
        "unweightedVertexCount": unweighted,
        "invalidVertexCount": invalid,
        "maxInfluencesPerVertex": max_influences,
        "normalized": normalized,
        "weightSumMin": min(sums) if sums else 0.0,
        "weightSumMax": max(sums) if sums else 0.0,
        "jointGroupNames": sorted(group.name for group in mesh_obj.vertex_groups),
        "armatureModifierPresent": bound_armature(mesh_obj) is not None,
        "inverseBindMatrixCount": len(armature_obj.data.bones) if armature_obj is not None else 0,
        "diagnostics": [],
        "influences": [
            [
                {"jointName": mesh_obj.vertex_groups[group.group].name, "weight": group.weight}
                for group in vertex.groups if group.weight > 0
            ]
            for vertex in mesh_obj.data.vertices[:10000]
        ],
    }
    body["fingerprint"] = fingerprint(body)
    return body


def bound_armature(mesh_obj):
    modifier = next((m for m in mesh_obj.modifiers if m.type == "ARMATURE"), None)
    return modifier.object if modifier is not None else None


def bind_skin(operation):
    armature_obj = find_armature(operation["rigObjectId"])
    mesh_obj = find_object(operation["objectId"])
    if mesh_obj.type != "MESH":
        raise RiggingFailure("SKIN_BINDING_MISSING", "Skin target is not a mesh object.")
    if bound_armature(mesh_obj) is not None:
        raise RiggingFailure("SKIN_BINDING_MISSING", "Mesh is already bound to an armature.")
    prepare_object_mode(mesh_obj)
    mesh_obj.select_set(True)
    armature_obj.select_set(True)
    bpy.context.view_layer.objects.active = armature_obj
    # Blender's real automatic-weights heuristic (envelope + nearest-bone), explicitly labeled as
    # such in the returned report (Phase 19B §17/§18) — never claimed as production-perfect.
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    if bound_armature(mesh_obj) is None:
        raise RiggingFailure("SKIN_BINDING_MISSING", "Blender did not create an Armature modifier.")
    prepare_object_mode(mesh_obj)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    report = skin_report(mesh_obj, armature_obj)
    if report["unweightedVertexCount"] > 0 or report["invalidVertexCount"] > 0 or not report["normalized"]:
        raise RiggingFailure("SKIN_WEIGHT_INVALID", "Automatic skin binding produced invalid or unnormalized weights.")
    return {**report, "method": "AUTOMATIC_HEURISTIC"}


def inspect_skin(operation):
    mesh_obj = find_object(operation["objectId"])
    if mesh_obj.type != "MESH":
        raise RiggingFailure("SKIN_BINDING_MISSING", "Requested object is not a mesh.")
    return skin_report(mesh_obj, bound_armature(mesh_obj))


def evaluated_vertices(mesh_obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh_obj.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        return [evaluated.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def pose_report(armature_obj, mesh_obj=None):
    bpy.context.view_layer.update()
    bones = []
    for bone in sorted(armature_obj.pose.bones, key=lambda entry: entry.name):
        location, rotation, scale = bone.matrix.decompose()
        world_location, world_rotation, _ = (armature_obj.matrix_world @ bone.matrix).decompose()
        world_tail = armature_obj.matrix_world @ bone.matrix @ Vector((0.0, bone.bone.length, 0.0))
        rest_world = armature_obj.matrix_world @ bone.bone.matrix_local
        joint_matrix = (armature_obj.matrix_world @ bone.matrix) @ rest_world.inverted()
        bones.append({
            "key": bone.name,
            "localPosition": to_aevum_vec(location),
            "localQuaternion": to_aevum_quat(rotation),
            "worldPosition": to_aevum_vec(world_location),
            "worldQuaternion": to_aevum_quat(world_rotation),
            "worldTailPosition": to_aevum_vec(world_tail),
            "jointMatrix": matrix_to_aevum_array(joint_matrix),
        })
    body = {"version": VERSION, "objectId": armature_obj.get(IDENTITY_KEY), "bones": bones}
    if mesh_obj is not None:
        points = evaluated_vertices(mesh_obj)
        body["meshObjectId"] = mesh_obj.get(IDENTITY_KEY)
        body["evaluatedVertexCount"] = len(points)
        body["evaluatedVertices"] = [to_aevum_vec(point) for point in points[:10000]]
    body["fingerprint"] = fingerprint(body)
    return body


def inspect_pose(operation):
    armature = find_armature(operation["objectId"])
    mesh = find_object(operation["meshObjectId"]) if operation.get("meshObjectId") else None
    if mesh is not None and mesh.type != "MESH":
        raise RiggingFailure("SKIN_BINDING_MISSING", "Pose inspection mesh target is not a mesh.")
    return pose_report(armature, mesh)


def update_pose(operation):
    armature = find_armature(operation["objectId"])
    bone = armature.pose.bones.get(operation["boneKey"])
    if bone is None:
        raise RiggingFailure("POSE_BONE_NOT_FOUND", "Requested pose bone was not found.")
    bone.rotation_mode = "QUATERNION"
    if "rotation" in operation:
        rotation = to_blender_quat(operation["rotation"])
        bone.rotation_quaternion = bone.rotation_quaternion @ rotation if operation["mode"] == "DELTA" else rotation
    if "translation" in operation:
        translation = to_blender_vec(operation["translation"])
        bone.location = bone.location + translation if operation["mode"] == "DELTA" else translation
    bpy.context.view_layer.update()
    mesh = find_object(operation["meshObjectId"]) if operation.get("meshObjectId") else None
    return pose_report(armature, mesh)


def reset_pose(operation):
    armature = find_armature(operation["objectId"])
    for bone in armature.pose.bones:
        bone.location = Vector((0.0, 0.0, 0.0))
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Quaternion((1.0, 0.0, 0.0, 0.0))
        bone.scale = Vector((1.0, 1.0, 1.0))
        for constraint in list(bone.constraints):
            if constraint.name.startswith("AEVUM_RUNTIME_"):
                bone.constraints.remove(constraint)
    bpy.context.view_layer.update()
    mesh = find_object(operation["meshObjectId"]) if operation.get("meshObjectId") else None
    return pose_report(armature, mesh)


def update_ik(operation):
    armature = find_armature(operation["objectId"])
    root = armature.pose.bones.get(operation["rootBoneKey"])
    end = armature.pose.bones.get(operation["endEffectorBoneKey"])
    if root is None or end is None:
        raise RiggingFailure("IK_CHAIN_INVALID", "IK root or end-effector bone was not found.")
    chain = []
    current = end
    while current is not None and len(chain) <= 32:
        chain.append(current)
        if current == root:
            break
        current = current.parent
    if not chain or chain[-1] != root:
        raise RiggingFailure("IK_CHAIN_INVALID", "IK root is not an ancestor of the end effector.")
    target = bpy.data.objects.get("AEVUM_RUNTIME_IK_TARGET")
    if target is None:
        target = bpy.data.objects.new("AEVUM_RUNTIME_IK_TARGET", None)
        bpy.context.scene.collection.objects.link(target)
    target.location = to_blender_vec(operation["target"])
    for existing in list(end.constraints):
        if existing.name == "AEVUM_RUNTIME_IK":
            end.constraints.remove(existing)
    constraint = end.constraints.new("IK")
    constraint.name = "AEVUM_RUNTIME_IK"
    constraint.target = target
    constraint.chain_count = len(chain)
    constraint.iterations = operation["iterations"]
    bpy.context.view_layer.update()
    end_world = armature.matrix_world @ end.matrix @ Vector((0.0, end.bone.length, 0.0))
    distance = (end_world - target.matrix_world.translation).length
    root_world = armature.matrix_world @ root.matrix
    total_length = sum(
        ((armature.matrix_world @ item.matrix @ Vector((0.0, item.bone.length, 0.0))) - (armature.matrix_world @ item.matrix).translation).length
        for item in chain
    )
    reachable = distance <= operation["tolerance"] or (target.matrix_world.translation - root_world.translation).length <= total_length + operation["tolerance"]
    mesh = find_object(operation["meshObjectId"]) if operation.get("meshObjectId") else None
    body = pose_report(armature, mesh)
    body.update({"chainLength": len(chain), "iterations": operation["iterations"], "distance": distance, "reachable": reachable, "converged": distance <= operation["tolerance"]})
    body["fingerprint"] = fingerprint({key: value for key, value in body.items() if key != "fingerprint"})
    return body


def update_constraint(operation):
    armature = find_armature(operation["objectId"])
    target = armature.pose.bones.get(operation["targetBoneKey"])
    source = armature.pose.bones.get(operation.get("sourceBoneKey")) if operation.get("sourceBoneKey") else None
    if target is None or (operation.get("sourceBoneKey") and source is None):
        raise RiggingFailure("CONSTRAINT_TARGET_INVALID", "Constraint target or source bone was not found.")
    mapping = {"COPY_ROTATION": "COPY_ROTATION", "COPY_LOCATION": "COPY_LOCATION", "LIMIT_ROTATION": "LIMIT_ROTATION", "LIMIT_LOCATION": "LIMIT_LOCATION", "TRACK_TO": "TRACK_TO"}
    constraint = target.constraints.new(mapping[operation["constraintType"]])
    constraint.name = "AEVUM_RUNTIME_" + operation["constraintId"]
    constraint.influence = operation["influence"]
    if source is not None and hasattr(constraint, "target"):
        constraint.target = armature
        constraint.subtarget = source.name
    settings = operation.get("settings", {})
    axis_properties = {"minX": "min_x", "minY": "min_y", "minZ": "min_z", "maxX": "max_x", "maxY": "max_y", "maxZ": "max_z"}
    for key, property_name in axis_properties.items():
        if key in settings and hasattr(constraint, property_name):
            setattr(constraint, property_name, float(settings[key]))
    bpy.context.view_layer.update()
    mesh = find_object(operation["meshObjectId"]) if operation.get("meshObjectId") else None
    return pose_report(armature, mesh)


def normalize_vertices(mesh_obj, indices=None):
    selected = set(indices) if indices is not None else None
    for vertex in mesh_obj.data.vertices:
        if selected is not None and vertex.index not in selected:
            continue
        entries = [(group, group.weight) for group in vertex.groups if group.weight > 0]
        total = sum(weight for _, weight in entries)
        if total <= 0:
            continue
        for group_ref, weight in entries:
            group = mesh_obj.vertex_groups[group_ref.group]
            group.add([vertex.index], weight / total, "REPLACE")


def update_weights(operation):
    mesh = find_object(operation["objectId"])
    if mesh.type != "MESH":
        raise RiggingFailure("SKIN_BINDING_MISSING", "Weight target is not a mesh.")
    indices = sorted(set(operation["vertexIndices"]))
    if any(index >= len(mesh.data.vertices) for index in indices):
        raise RiggingFailure("SKIN_WEIGHT_INVALID", "Weight edit references a missing vertex.")
    group = mesh.vertex_groups.get(operation["boneKey"])
    if group is None:
        raise RiggingFailure("POSE_BONE_NOT_FOUND", "Weight edit bone group was not found.")
    mode = operation["mode"]
    if mode == "CLEAR":
        group.remove(indices)
    else:
        blender_mode = {"SET": "REPLACE", "ADD": "ADD", "SUBTRACT": "SUBTRACT"}[mode]
        group.add(indices, operation["value"], blender_mode)
    if operation.get("normalize", True):
        normalize_vertices(mesh, indices)
    return skin_report(mesh, bound_armature(mesh))


def normalize_skin(operation):
    mesh = find_object(operation["objectId"])
    if mesh.type != "MESH":
        raise RiggingFailure("SKIN_BINDING_MISSING", "Weight target is not a mesh.")
    indices = operation.get("vertexIndices")
    if indices and any(index >= len(mesh.data.vertices) for index in indices):
        raise RiggingFailure("SKIN_WEIGHT_INVALID", "Weight normalization references a missing vertex.")
    normalize_vertices(mesh, indices)
    report = skin_report(mesh, bound_armature(mesh))
    if report["invalidVertexCount"] > 0:
        raise RiggingFailure("SKIN_WEIGHT_INVALID", "Weight normalization left invalid data.")
    return report


def validate_deformation(operation):
    mesh = find_object(operation["objectId"])
    if mesh.type != "MESH":
        raise RiggingFailure("SKIN_BINDING_MISSING", "Deformation target is not a mesh.")
    rest = [mesh.matrix_world @ vertex.co for vertex in mesh.data.vertices]
    posed = evaluated_vertices(mesh)
    if len(rest) != len(posed):
        raise RiggingFailure("DEFORMATION_INVALID", "Evaluated deformation changed vertex topology.")
    displacements = [(posed[index] - rest[index]).length for index in range(len(rest))]
    finite_vertices = all(math.isfinite(value) for point in posed for value in point)
    diagonal = max(((Vector(corner_a) - Vector(corner_b)).length for corner_a in mesh.bound_box for corner_b in mesh.bound_box), default=0.0)
    maximum = max(displacements, default=0.0)
    valid = finite_vertices and (diagonal <= 1.0e-9 or maximum <= diagonal * operation["maxDisplacementRatio"])
    body = {"version": VERSION, "meshObjectId": mesh.get(IDENTITY_KEY), "valid": valid, "vertexCount": len(rest), "maximumDisplacement": maximum, "meanDisplacement": sum(displacements) / len(displacements) if displacements else 0.0, "restDiagonal": diagonal, "evaluatedVertices": [to_aevum_vec(point) for point in posed[:10000]], "diagnostics": [] if valid else [{"code": "DEFORMATION_INVALID", "severity": "ERROR"}]}
    body["fingerprint"] = fingerprint(body)
    return body


def execute_rigging(operation):
    kind = operation["kind"]
    if kind == "rig.create":
        return create_rig(operation)
    if kind == "rig.inspect":
        return rig_inspect_data(find_armature(operation["objectId"]))
    if kind == "skin.bind":
        return bind_skin(operation)
    if kind == "skin.inspect":
        return inspect_skin(operation)
    if kind == "pose.inspect":
        return inspect_pose(operation)
    if kind == "pose.update":
        return update_pose(operation)
    if kind == "pose.reset":
        return reset_pose(operation)
    if kind == "ik.update":
        return update_ik(operation)
    if kind == "constraint.update":
        return update_constraint(operation)
    if kind == "skin.weight_update":
        return update_weights(operation)
    if kind == "skin.weight_normalize":
        return normalize_skin(operation)
    if kind == "deformation.validate":
        return validate_deformation(operation)
    raise RiggingFailure("BLENDER_OPERATION_UNSUPPORTED", "Rigging operation is not implemented.")
