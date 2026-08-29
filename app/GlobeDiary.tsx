"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

type Photo = { id: number; url: string; contentType: string; sortOrder: number };
type Footprint = {
  id: number; city: string; country: string; latitude: number; longitude: number;
  visitedAt: string; createdAt: string; photos: Photo[];
};
type BoundaryFeature = {
  properties: Record<string, unknown> & { key?: string; name?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

const PRESETS = [
  { key: "singapore", city: "新加坡", country: "新加坡", latitude: 1.3521, longitude: 103.8198 },
  { key: "chongqing", city: "重庆", country: "中国", latitude: 29.563, longitude: 106.5516 },
  { key: "chengdu", city: "成都", country: "中国", latitude: 30.5728, longitude: 104.0668 },
  { key: "bangkok", city: "曼谷", country: "泰国", latitude: 13.7563, longitude: 100.5018 },
  { key: "hakodate", city: "函馆", country: "日本", latitude: 41.7687, longitude: 140.7288 },
  { key: "otaru", city: "小樽", country: "日本", latitude: 43.1907, longitude: 140.9947 },
  { key: "sapporo", city: "札幌", country: "日本", latitude: 43.0618, longitude: 141.3545 },
];

function globePoint(latitude: number, longitude: number, radius = 1) {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function boundaryRings(feature: BoundaryFeature): number[][][] {
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates as number[][][];
  return (feature.geometry.coordinates as number[][][][]).flat();
}

function mapLine(ring: number[][], radius: number, material: LineMaterial) {
  const positions = ring.flatMap(([longitude, latitude]) => {
    const point = globePoint(latitude, longitude, radius);
    return [point.x, point.y, point.z];
  });
  if (positions.length < 9) return null;
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  const line = new Line2(geometry, material);
  line.computeLineDistances();
  return line;
}

function GlobeCanvas({ footprints, selectedId, onSelect }: {
  footprints: Footprint[]; selectedId: number | null; onSelect: (id: number) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const selectedCityRef = useRef(footprints.find((item) => item.id === selectedId)?.city ?? footprints[0]?.city ?? "");
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedCityRef.current = footprints.find((item) => item.id === selectedId)?.city ?? footprints[0]?.city ?? "";
  }, [selectedId, footprints]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.025, 100);
    camera.position.set(0, 0.08, 3.9);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const globe = new THREE.Group();
    globe.rotation.y = Math.PI;
    scene.add(globe);
    const earthMaterial = new THREE.MeshStandardMaterial({
      color: 0x123542,
      emissive: 0x06171f,
      emissiveIntensity: 0.62,
      roughness: 0.88,
      metalness: 0.08,
    });
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 96),
      earthMaterial,
    ));
    let disposed = false;
    scene.add(new THREE.HemisphereLight(0xb8e5df, 0x061117, 2.4));
    const sunlight = new THREE.DirectionalLight(0xe7fff8, 2.2);
    sunlight.position.set(-3, 3, 4);
    scene.add(sunlight);
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 96, 72),
      new THREE.MeshBasicMaterial({ color: 0x75cbbb, transparent: true, opacity: 0.075, side: THREE.BackSide }),
    ));

    const markers = footprints.map((footprint) => {
      const marker = new THREE.Group();
      const surfaceNormal = globePoint(footprint.latitude, footprint.longitude).normalize();
      marker.position.copy(surfaceNormal.clone().multiplyScalar(1.025));
      marker.userData.footprintId = footprint.id;
      const hitArea = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 10),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      marker.add(hitArea);
      globe.add(marker);
      return marker;
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.12;
    controls.maxDistance = 5.2;
    controls.zoomSpeed = 0.9;
    controls.zoomToCursor = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.26;
    let focusDirection: THREE.Vector3 | null = null;
    let focusDistance = camera.position.length();
    let lastFocusedId: number | null | undefined;
    const stopFocus = () => { controls.autoRotate = false; focusDirection = null; };
    controls.addEventListener("start", stopFocus);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(markers, true)[0];
      const footprintId = hit?.object.parent?.userData.footprintId;
      if (footprintId) onSelectRef.current(footprintId as number);
    };
    renderer.domElement.addEventListener("pointerup", pick);

    const lineMaterials: LineMaterial[] = [];
    const countryMaterial = new LineMaterial({
      color: 0x7eb7b2,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      linewidth: 0.78,
    });
    lineMaterials.push(countryMaterial);
    const boundaryVisuals: Array<{ city: string; core: LineMaterial; glow: LineMaterial }> = [];
    let frame = 0;
    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
      for (const material of lineMaterials) material.resolution.set(clientWidth, clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const graticuleMaterial = new THREE.LineBasicMaterial({
      color: 0x5e8d93,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const points = [];
      for (let longitude = -180; longitude <= 180; longitude += 3) points.push(globePoint(latitude, longitude, 1.003));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), graticuleMaterial));
    }
    for (let longitude = -180; longitude < 180; longitude += 30) {
      const points = [];
      for (let latitude = -87; latitude <= 87; latitude += 3) points.push(globePoint(latitude, longitude, 1.003));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), graticuleMaterial));
    }

    fetch("/world-countries.geojson")
      .then((response) => response.json())
      .then((collection: { features: BoundaryFeature[] }) => {
        if (disposed) return;
        for (const feature of collection.features) {
          for (const ring of boundaryRings(feature)) {
            const line = mapLine(ring, 1.006, countryMaterial);
            if (line) globe.add(line);
          }
        }
      })
      .catch(console.error);

    fetch("/visited-boundaries.json")
      .then((response) => response.json())
      .then((collection: { features: BoundaryFeature[] }) => {
        if (disposed) return;
        for (const feature of collection.features) {
          const coreMaterial = new LineMaterial({
            color: 0x79d4c4,
            transparent: true,
            opacity: 0.58,
            depthWrite: false,
            linewidth: 1.65,
          });
          const glowMaterial = new LineMaterial({
            color: 0xf4ca6f,
            transparent: true,
            opacity: 0.015,
            depthWrite: false,
            linewidth: 5,
            blending: THREE.AdditiveBlending,
          });
          coreMaterial.resolution.set(mount.clientWidth, mount.clientHeight);
          glowMaterial.resolution.set(mount.clientWidth, mount.clientHeight);
          lineMaterials.push(coreMaterial, glowMaterial);
          boundaryVisuals.push({ city: String(feature.properties.name ?? ""), core: coreMaterial, glow: glowMaterial });
          for (const ring of boundaryRings(feature)) {
            const glowLine = mapLine(ring, 1.017, glowMaterial);
            const coreLine = mapLine(ring, 1.019, coreMaterial);
            if (glowLine) globe.add(glowLine);
            if (coreLine) globe.add(coreLine);
          }
        }
      })
      .catch(console.error);

    const animationStartedAt = performance.now();
    const cameraDirection = new THREE.Vector3();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (selectedIdRef.current !== lastFocusedId) {
        lastFocusedId = selectedIdRef.current;
        const footprint = footprints.find((item) => item.id === selectedIdRef.current);
        if (footprint) {
          focusDirection = globePoint(footprint.latitude, footprint.longitude).applyQuaternion(globe.quaternion).normalize();
          focusDistance = camera.position.length();
          controls.autoRotate = false;
        }
      }
      if (focusDirection) {
        cameraDirection.copy(camera.position).normalize().lerp(focusDirection, 0.085).normalize();
        camera.position.copy(cameraDirection.multiplyScalar(focusDistance));
        if (camera.position.clone().normalize().angleTo(focusDirection) < 0.002) focusDirection = null;
      }
      controls.update();
      const time = (performance.now() - animationStartedAt) / 1000;
      for (const visual of boundaryVisuals) {
        const active = visual.city === selectedCityRef.current;
        visual.core.color.set(active ? 0xf6cf76 : 0x79d4c4);
        visual.core.opacity = active ? 1 : 0.52;
        visual.core.linewidth = active ? 4.4 : 1.55;
        visual.glow.color.set(active ? 0xf6cf76 : 0x55b9ae);
        visual.glow.opacity = active ? 0.13 + Math.sin(time * 2.2) * 0.025 : 0.012;
        visual.glow.linewidth = active ? 9 : 4;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerup", pick);
      controls.removeEventListener("start", stopFocus);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const material = object.material as THREE.Material | THREE.Material[];
          (Array.isArray(material) ? material : [material]).forEach((item) => item.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [footprints]);

  return <div className="globe-canvas" ref={mountRef} aria-label="可旋转的三维地球" />;
}

function PhotoStack({ footprint }: { footprint: Footprint }) {
  const [active, setActive] = useState(footprint.photos[0] ?? null);
  if (!footprint.photos.length) return <div className="photo-empty">这个地点还没有照片</div>;
  return (
    <div className="photo-viewer">
      <div className="photo-detail">{active && <img src={active.url} alt={`${footprint.city}的照片`} />}</div>
      <div className="photo-stack" aria-label={`${footprint.city}的照片`}>
        {footprint.photos.map((photo, index) => (
          <button className={active?.id === photo.id ? "photo-card active" : "photo-card"} key={photo.id}
            style={{ "--photo-index": index } as React.CSSProperties}
            onMouseEnter={() => setActive(photo)} onFocus={() => setActive(photo)} onClick={() => setActive(photo)} type="button">
            <img src={photo.url} alt={`${footprint.city}照片 ${index + 1}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function GlobeDiary() {
  const [footprints, setFootprints] = useState<Footprint[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [presetKey, setPresetKey] = useState(PRESETS[0].key);
  const [customPlace, setCustomPlace] = useState({ city: "", country: "", latitude: "", longitude: "" });
  const [visitedAt, setVisitedAt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const selected = useMemo(() => footprints.find((item) => item.id === selectedId) ?? footprints[0] ?? null, [footprints, selectedId]);
  const preset = PRESETS.find((item) => item.key === presetKey);
  const load = async () => {
    const response = await fetch("/api/footprints", { cache: "no-store" });
    const data = await response.json() as { footprints?: Footprint[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "读取失败");
    const next = (data.footprints ?? []).map((item) => ({ ...item, photos: item.photos ?? [] }));
    setFootprints(next);
    setSelectedId((current) => current ?? next[0]?.id ?? null);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { load().catch(() => setNotice("暂时无法读取地点")); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (files.length > 5) return setNotice("每个地点最多上传五张照片");
    setBusy(true); setNotice("");
    const body = new FormData();
    body.set("city", preset?.city ?? customPlace.city); body.set("country", preset?.country ?? customPlace.country);
    body.set("latitude", String(preset?.latitude ?? customPlace.latitude)); body.set("longitude", String(preset?.longitude ?? customPlace.longitude));
    body.set("visitedAt", visitedAt); files.forEach((file) => body.append("photos", file));
    try {
      const response = await fetch("/api/footprints", { method: "POST", body });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      await load(); setFormOpen(false); setFiles([]); setVisitedAt("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  };

  return (
    <main className="site-shell">
      <header className="topbar"><div><p className="eyebrow">PRIVATE ATLAS</p><h1>我们的地球</h1></div><button className="add-button" type="button" onClick={() => setFormOpen(true)}>添加地点 / 照片</button></header>
      <section className="workspace">
        <div className="globe-stage"><GlobeCanvas footprints={footprints} selectedId={selected?.id ?? null} onSelect={setSelectedId} /><p className="globe-hint">右侧选择城市 · 金色粗线显示行政边界 · 拖动旋转，滚轮放大</p></div>
        <aside className="places-panel">
          <div className="panel-heading"><span>已记录地点</span><strong>{footprints.length}</strong></div>
          <div className="places-list">{footprints.map((item) => (
            <button className={selected?.id === item.id ? "place-row active" : "place-row"} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
              <span className="place-dot" /><span><b>{item.city}</b><small>{item.country}</small></span><span className="place-count">{item.photos.length || "—"}</span>
            </button>
          ))}</div>
          {selected && <div className="selection-panel" key={selected.id}>
            <div className="selection-title"><div><span>{selected.country}</span><h2>{selected.city}</h2></div>{selected.visitedAt && <time>{selected.visitedAt}</time>}</div>
            {PRESETS.some((item) => item.city === selected.city)
              ? <div className="boundary-status"><i /><span>边界已高亮</span><small>金色实线为 {selected.city} 的行政边界</small></div>
              : <div className="boundary-status"><i /><span>位置已标记</span><small>自定义地点显示为坐标点</small></div>}
            <PhotoStack key={selected.id} footprint={selected} />
          </div>}
        </aside>
      </section>
      <footer>世界地图：Natural Earth · 城市边界：© OpenStreetMap contributors</footer>
      {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setFormOpen(false); }}>
        <form className="location-form" onSubmit={submit}>
          <div className="form-heading"><div><p className="eyebrow">NEW PLACE</p><h2>添加地点 / 照片</h2></div><button type="button" onClick={() => setFormOpen(false)} aria-label="关闭">×</button></div>
          <label>地点<select value={presetKey} onChange={(event) => setPresetKey(event.target.value)}>{PRESETS.map((item) => <option value={item.key} key={item.key}>{item.city} · {item.country}</option>)}<option value="custom">自定义地点</option></select></label>
          {presetKey === "custom" && <div className="custom-grid">
            <label>城市<input value={customPlace.city} required onChange={(event) => setCustomPlace({ ...customPlace, city: event.target.value })} /></label>
            <label>国家或地区<input value={customPlace.country} required onChange={(event) => setCustomPlace({ ...customPlace, country: event.target.value })} /></label>
            <label>纬度<input type="number" min="-90" max="90" step="any" value={customPlace.latitude} required onChange={(event) => setCustomPlace({ ...customPlace, latitude: event.target.value })} /></label>
            <label>经度<input type="number" min="-180" max="180" step="any" value={customPlace.longitude} required onChange={(event) => setCustomPlace({ ...customPlace, longitude: event.target.value })} /></label>
            <p>经纬度可以从手机地图的地点详情中复制</p>
          </div>}
          <label>日期（可选）<input type="date" value={visitedAt} onChange={(event) => setVisitedAt(event.target.value)} /></label>
          <label>照片（最多五张）<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => { const next = Array.from(event.target.files ?? []).slice(0, 5); setFiles(next); setNotice((event.target.files?.length ?? 0) > 5 ? "只会保留前五张照片" : ""); }} /></label>
          {files.length > 0 && <div className="file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}
          {notice && <p className="form-notice">{notice}</p>}
          <button className="submit-button" type="submit" disabled={busy}>{busy ? "保存中…" : "保存地点"}</button>
        </form>
      </div>}
    </main>
  );
}
