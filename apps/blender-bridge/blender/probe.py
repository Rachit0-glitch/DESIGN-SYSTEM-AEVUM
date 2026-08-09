import bpy
import json
import platform
import sys

payload = {
    "blenderVersion": ".".join(str(value) for value in bpy.app.version),
    "pythonVersion": platform.python_version(),
    "platform": sys.platform,
}
print("AEVUM_RUNTIME_RESULT=" + json.dumps(payload, sort_keys=True, separators=(",", ":")))
