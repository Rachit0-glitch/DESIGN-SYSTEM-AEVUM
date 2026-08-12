import bpy
from mathutils import Matrix, Quaternion, Vector

IDENTITY_KEY = "aevum.entity_id"
SUPPORTED_CAMERAS = {"camera.apply", "cinematic.apply_sequence"}
C = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)))


class CameraFailure(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def vector_to_blender(value):
    return C @ Vector((value["x"], value["y"], value["z"]))


def quaternion_to_blender(value):
    q = Quaternion((value["w"], value["x"], value["y"], value["z"]))
    return (C.to_quaternion() @ q @ C.inverted().to_quaternion()).normalized()


def find_camera(entity_id):
    data = next((item for item in bpy.data.cameras if item.get(IDENTITY_KEY) == entity_id), None)
    obj = next((item for item in bpy.data.objects if item.get(IDENTITY_KEY) == entity_id or item.data == data), None)
    return obj


def ensure_camera(camera, create):
    obj = find_camera(camera["id"])
    if obj is None:
        if not create:
            raise CameraFailure("BLENDER_CAMERA_NOT_FOUND", "Canonical camera was not found in the scene.")
        data = bpy.data.cameras.new(camera["name"])
        obj = bpy.data.objects.new(camera["name"], data)
        bpy.context.scene.collection.objects.link(obj)
    obj[IDENTITY_KEY] = camera["id"]
    obj.data[IDENTITY_KEY] = camera["id"]
    obj.name = camera["name"]
    obj.data.name = camera["name"]
    return obj


def apply_camera(camera, create=False):
    obj = ensure_camera(camera, create)
    transform = camera["transform"]
    obj.location = vector_to_blender(transform["position"])
    obj.rotation_mode = "QUATERNION"
    if "quaternion" in transform:
        obj.rotation_quaternion = quaternion_to_blender(transform["quaternion"])
    else:
        rotation = transform["rotation"]
        obj.rotation_euler = (rotation["x"], -rotation["z"], rotation["y"])
    data = obj.data
    data.type = "ORTHO" if camera["projection"] == "ORTHOGRAPHIC" else "PERSP"
    if "focalLength" in camera:
        data.lens = camera["focalLength"]
    if "orthographicSize" in camera:
        data.ortho_scale = camera["orthographicSize"]
    data.sensor_width = camera["sensor"]["width"]
    data.sensor_height = camera["sensor"]["height"]
    data.sensor_fit = camera["sensor"]["fit"]
    data.shift_x = camera["lensShift"]["x"]
    data.shift_y = camera["lensShift"]["y"]
    data.clip_start = camera["nearClip"]
    data.clip_end = camera["farClip"]
    dof = camera["depthOfField"]
    data.dof.use_dof = dof["enabled"]
    data.dof.focus_distance = dof["focusDistance"]
    data.dof.aperture_fstop = dof["aperture"]
    data.dof.aperture_blades = dof["bladeCount"]
    bpy.context.scene.camera = obj
    bpy.context.view_layer.update()
    return obj


def record(obj):
    data = obj.data
    return {
        "entityId": data.get(IDENTITY_KEY) or obj.get(IDENTITY_KEY),
        "name": data.name,
        "projection": "ORTHOGRAPHIC" if data.type == "ORTHO" else "PERSPECTIVE",
        "focalLength": data.lens,
        "fieldOfView": data.angle_y,
        "sensor": {"width": data.sensor_width, "height": data.sensor_height, "fit": data.sensor_fit},
        "lensShift": {"x": data.shift_x, "y": data.shift_y},
        "nearClip": data.clip_start,
        "farClip": data.clip_end,
        "depthOfField": {
            "enabled": data.dof.use_dof,
            "focusDistance": data.dof.focus_distance,
            "aperture": data.dof.aperture_fstop,
            "bladeCount": data.dof.aperture_blades,
        },
        "active": bpy.context.scene.camera == obj,
    }


def execute_cameras(operation):
    if operation["kind"] == "camera.apply":
        return record(apply_camera(operation["camera"], operation["create"]))
    samples = operation["samples"]
    fps = operation["frameRate"]
    for sample in samples:
        obj = apply_camera(sample["camera"], sample["create"])
        frame = round(sample["time"] * fps)
        obj.keyframe_insert(data_path="location", frame=frame)
        obj.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        obj.data.keyframe_insert(data_path="lens", frame=frame)
        obj.data.keyframe_insert(data_path="shift_x", frame=frame)
        obj.data.keyframe_insert(data_path="shift_y", frame=frame)
        obj.data.dof.keyframe_insert(data_path="focus_distance", frame=frame)
    bpy.context.scene.frame_start = min(round(sample["time"] * fps) for sample in samples)
    bpy.context.scene.frame_end = max(round(sample["time"] * fps) for sample in samples)
    bpy.context.scene.render.fps = round(fps)
    bpy.context.scene.frame_set(bpy.context.scene.frame_end)
    return {
        "sequenceId": operation["sequenceId"],
        "sampleCount": len(samples),
        "cameraIds": sorted(set(sample["camera"]["id"] for sample in samples)),
        "frameStart": bpy.context.scene.frame_start,
        "frameEnd": bpy.context.scene.frame_end,
        "activeCamera": bpy.context.scene.camera.get(IDENTITY_KEY) if bpy.context.scene.camera else None,
    }
