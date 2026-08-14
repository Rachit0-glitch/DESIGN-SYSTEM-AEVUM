import { useEffect, useRef } from "react";
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Material,
} from "three";
import type { StudioSessionSnapshot } from "../core/session.js";

export default function ThreeViewport({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: StudioSessionSnapshot;
  selected: readonly string[];
  onSelect: (id: string, additive: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meshNode = Object.values(snapshot.document.nodes).find((node) => node.type === "MESH_3D");
  const material = Object.values(snapshot.document.materials).find((entry) => entry.type === "PBR" && entry.pbr);
  const cameraDefinition = Object.values(snapshot.document.cameras)[0];
  const lightDefinition = Object.values(snapshot.document.lights)[0];
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || meshNode?.type !== "MESH_3D" || material?.type !== "PBR" || !material.pbr) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch {
      canvas.dataset.unavailable = "true";
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new Scene();
    scene.background = new Color("#1b1e20");
    const camera = new PerspectiveCamera(42, 1, cameraDefinition?.nearClip ?? 0.1, cameraDefinition?.farClip ?? 100);
    camera.position.set(
      cameraDefinition?.transform.position.x ?? 4.2,
      cameraDefinition?.transform.position.y ?? 3.2,
      cameraDefinition?.transform.position.z ?? 5.4,
    );
    camera.lookAt(0, 0, 0);
    const pbr = material.pbr;
    const mesh = new Mesh(
      new BoxGeometry(2.3, 2.3, 2.3),
      new MeshStandardMaterial({
        color: new Color(pbr.baseColor.r, pbr.baseColor.g, pbr.baseColor.b),
        roughness: pbr.roughness,
        metalness: pbr.metalness,
      }),
    );
    mesh.position.set(meshNode.transform.position.x, meshNode.transform.position.y, meshNode.transform.position.z);
    mesh.rotation.set(meshNode.transform.rotation.x, meshNode.transform.rotation.y, meshNode.transform.rotation.z);
    mesh.scale.set(meshNode.transform.scale.x, meshNode.transform.scale.y, meshNode.transform.scale.z);
    scene.add(mesh);
    scene.add(new HemisphereLight("#e9fff5", "#2d302b", 1.8));
    const key = new DirectionalLight("#ff9a78", Math.max(1, (lightDefinition?.intensity ?? 1200) / 300));
    key.position.set(
      lightDefinition?.transform.position.x ?? 3,
      lightDefinition?.transform.position.y ?? 4,
      lightDefinition?.transform.position.z ?? 2,
    );
    scene.add(key);
    scene.add(new GridHelper(12, 24, "#48504e", "#2b3031"));
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    let frame = requestAnimationFrame(function animate() {
      mesh.rotation.y += 0.0025;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    };
  }, [cameraDefinition, lightDefinition, material, meshNode]);
  return (
    <main className="three-workspace">
      <canvas ref={canvasRef} data-testid="three-canvas" onClick={() => meshNode && onSelect(meshNode.id, false)} />
      {!meshNode || !material ? (
        <div className="panel-error">
          <strong>No renderable 3D scene</strong>
          <span>Add a canonical mesh and PBR material.</span>
        </div>
      ) : null}
      <div className="three-overlay">
        <span>Perspective</span>
        <span>Maximum Fidelity</span>
      </div>
      <div className="gizmo">
        <i className="axis-x" />
        <i className="axis-y" />
        <i className="axis-z" />
      </div>
      <section className="three-inspector">
        <strong>Scene inspection</strong>
        <div>
          <span>Objects</span>
          <b>{snapshot.projection.statistics.threeDimensionalNodes}</b>
        </div>
        <div>
          <span>Materials</span>
          <b>{Object.keys(snapshot.document.materials).length}</b>
        </div>
        <div>
          <span>Cameras</span>
          <b>{Object.keys(snapshot.document.cameras).length}</b>
        </div>
        <div>
          <span>Lights</span>
          <b>{Object.keys(snapshot.document.lights).length}</b>
        </div>
        <small>{selected.length ? "Canonical selection linked" : "No canonical selection"}</small>
      </section>
    </main>
  );
}
