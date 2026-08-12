import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

IDENTITY_KEY = "aevum.entity_id"
C = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)))
C_INV = C.inverted()
SUPPORTED_LIGHTING = {"lighting.inspect", "lighting.apply_rig", "lighting.validate", "lighting.bake"}


class LightingFailure(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _vector(value):
    return C @ Vector((value["x"], value["y"], value["z"]))


def _rotation(value):
    euler = Matrix.Rotation(value["z"], 3, "Z") @ Matrix.Rotation(value["y"], 3, "Y") @ Matrix.Rotation(value["x"], 3, "X")
    return (C @ euler @ C_INV).to_quaternion()


def _record(obj):
    light = obj.data
    return {
        "entityId": light.get(IDENTITY_KEY) or obj.get(IDENTITY_KEY),
        "name": light.name,
        "type": {"SUN": "DIRECTIONAL", "POINT": "POINT", "SPOT": "SPOT", "AREA": "AREA"}.get(light.type, light.type),
        "intensity": float(light.energy),
        "color": [float(channel) for channel in light.color],
        "castShadow": bool(light.use_shadow),
        "position": [float(value) for value in obj.matrix_world.translation],
        "areaShape": getattr(light, "shape", None),
        "areaSize": float(getattr(light, "size", 0.0)),
    }


def _inspect():
    lights = sorted((_record(obj) for obj in bpy.context.scene.objects if obj.type == "LIGHT"), key=lambda entry: entry["entityId"] or entry["name"])
    world = bpy.context.scene.world
    return {
        "lights": lights,
        "lightCount": len(lights),
        "shadowLightCount": sum(1 for entry in lights if entry["castShadow"]),
        "environment": {
            "color": [float(value) for value in world.color] if world else [0.0, 0.0, 0.0],
            "strength": float(world.node_tree.nodes.get("Background").inputs["Strength"].default_value) if world and world.use_nodes and world.node_tree.nodes.get("Background") else 0.0,
        },
        "renderEngine": bpy.context.scene.render.engine,
    }


def _clear_controlled_lights():
    for obj in list(bpy.context.scene.objects):
        if obj.type == "LIGHT" and (obj.get(IDENTITY_KEY) or obj.data.get(IDENTITY_KEY)):
            bpy.data.objects.remove(obj, do_unlink=True)


def _apply_light(value):
    light_type = {"DIRECTIONAL": "SUN", "POINT": "POINT", "SPOT": "SPOT", "AREA": "AREA"}.get(value["type"])
    if light_type is None:
        raise LightingFailure("LIGHTING_INVALID", "The requested light type is not executable by the bounded Blender adapter.")
    data = bpy.data.lights.new(value["name"], type=light_type)
    data[IDENTITY_KEY] = value["id"]
    data.color = (value["color"]["r"], value["color"]["g"], value["color"]["b"])
    data.energy = value["intensity"]
    data.use_shadow = bool(value.get("shadow", {}).get("enabled", value.get("castShadow", False)))
    if light_type == "AREA" and value.get("size"):
        data.shape = {"RECTANGLE": "RECTANGLE", "DISK": "DISK", "ELLIPSE": "ELLIPSE", "SPHERE": "DISK"}.get(value.get("shape"), "RECTANGLE")
        data.size = value["size"]["width"]
        if hasattr(data, "size_y"):
            data.size_y = value["size"]["height"]
    if light_type == "SPOT":
        data.spot_size = value.get("outerConeAngle", math.pi / 4) * 2
        data.spot_blend = min(1.0, max(0.0, value.get("penumbra", 0.15)))
    obj = bpy.data.objects.new(value["name"], data)
    obj[IDENTITY_KEY] = value["id"]
    transform = value["transform"]
    obj.matrix_world = Matrix.LocRotScale(_vector(transform["position"]), _rotation(transform["rotation"]), Vector((1.0, 1.0, 1.0)))
    bpy.context.scene.collection.objects.link(obj)


def _apply_environment(value):
    world = bpy.context.scene.world or bpy.data.worlds.new("AEVUM World")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (value["color"]["r"], value["color"]["g"], value["color"]["b"], 1.0)
        background.inputs["Strength"].default_value = value["intensity"]
    world[IDENTITY_KEY] = value["id"]


def _apply_profile(profile):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False


def _validate(target):
    report = _inspect()
    invalid = [entry for entry in report["lights"] if not math.isfinite(entry["intensity"]) or entry["intensity"] < 0]
    max_lights = 4 if target == "MOBILE" else 64
    return {
        **report,
        "target": target,
        "valid": not invalid and report["lightCount"] > 0 and report["lightCount"] <= max_lights,
        "invalidLightIds": [entry["entityId"] for entry in invalid],
        "materialIssueCount": 0,
        "lightingIssueCount": len(invalid) + (1 if report["lightCount"] > max_lights else 0),
    }


def _bake(operation, output_path):
    if not output_path:
        raise LightingFailure("LIGHTING_BAKE_FAILED", "The controlled lighting bake output is unavailable.")
    camera = next((obj for obj in bpy.context.scene.objects if obj.type == "CAMERA" and (obj.get(IDENTITY_KEY) == operation["cameraId"] or obj.data.get(IDENTITY_KEY) == operation["cameraId"])), None)
    if camera is None:
        raise LightingFailure("BLENDER_CAMERA_NOT_FOUND", "The lighting bake camera was not found.")
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = operation["resolution"]
    scene.render.resolution_y = operation["resolution"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output_path
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as error:
        raise LightingFailure("LIGHTING_BAKE_FAILED", "Blender failed to render the bounded lighting bake.") from error
    if not os.path.isfile(output_path):
        raise LightingFailure("BLENDER_OUTPUT_MISSING", "Blender reported success without a lighting bake artifact.")
    return {"bakeType": operation["bakeType"], "resolution": operation["resolution"], "samples": operation["samples"], "output": "lighting-bake.png"}


def execute_lighting(operation, output_path=None):
    kind = operation["kind"]
    if kind == "lighting.inspect":
        return _inspect()
    if kind == "lighting.apply_rig":
        _clear_controlled_lights()
        for light in operation["lights"]:
            _apply_light(light)
        if operation.get("environment"):
            _apply_environment(operation["environment"])
        profile = next((entry for entry in operation["profiles"] if entry["target"] == operation["target"]), operation["profiles"][0])
        _apply_profile(profile)
        return {**_inspect(), "rigId": operation["rig"]["id"], "target": operation["target"]}
    if kind == "lighting.validate":
        return _validate(operation["target"])
    if kind == "lighting.bake":
        return _bake(operation, output_path)
    raise LightingFailure("BLENDER_OPERATION_UNSUPPORTED", "Lighting operation is not registered by this bridge runtime.")
