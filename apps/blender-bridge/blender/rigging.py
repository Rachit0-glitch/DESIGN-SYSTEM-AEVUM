import bpy
import hashlib
import json
from mathutils import Vector

IDENTITY_KEY = "aevum.entity_id"
RIG_FINGERPRINT_KEY = "aevum.rig_fingerprint"
VERSION = "1.0.0"

SUPPORTED_RIGGING = {"rig.create", "rig.inspect", "skin.bind", "skin.inspect"}


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
    raise RiggingFailure("BLENDER_OPERATION_UNSUPPORTED", "Rigging operation is not implemented.")
