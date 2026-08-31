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
  boundary: BoundaryFeature["geometry"] | null;
  visitedAt: string; createdAt: string; photos: Photo[];
};
type BoundaryFeature = {
  properties: Record<string, unknown> & { key?: string; name?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

const SEEDED_CITIES = new Set(["新加坡", "重庆", "成都", "曼谷", "函馆", "小樽", "札幌"]);

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

function boundaryPolygons(feature: BoundaryFeature): number[][][][] {
  if (feature.geometry.type === "Polygon") return [feature.geometry.coordinates as number[][][]];
  return feature.geometry.coordinates as number[][][][];
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

function mapFill(polygon: number[][][], radius: number, material: THREE.MeshBasicMaterial) {
  const contour = polygon[0]?.map(([longitude, latitude]) => new THREE.Vector2(longitude, latitude)) ?? [];
  const holes = polygon.slice(1).map((ring) => ring.map(([longitude, latitude]) => new THREE.Vector2(longitude, latitude)));
  if (contour.length < 3) return null;
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const vertices = [...contour, ...holes.flat()];
  if (!faces.length || !vertices.length) return null;
  const positions = vertices.flatMap((point) => {
    const vertex = globePoint(point.y, point.x, radius);
    return [vertex.x, vertex.y, vertex.z];
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(faces.flat());
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  return mesh;
}

function pinGeometry() {
  const pin = new THREE.Shape();
  pin.moveTo(0, -0.043);
  pin.bezierCurveTo(-0.006, -0.027, -0.022, -0.011, -0.022, 0.011);
  pin.bezierCurveTo(-0.022, 0.028, -0.012, 0.038, 0, 0.038);
  pin.bezierCurveTo(0.012, 0.038, 0.022, 0.028, 0.022, 0.011);
  pin.bezierCurveTo(0.022, -0.011, 0.006, -0.027, 0, -0.043);
  const geometry = new THREE.ShapeGeometry(pin, 24);
  geometry.translate(0, 0.043, 0);
  return geometry;
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
      color: 0x2b1d47,
      emissive: 0x10091f,
      emissiveIntensity: 0.62,
      roughness: 0.88,
      metalness: 0.08,
    });
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 96),
      earthMaterial,
    );
    globe.add(earth);
    let disposed = false;
    scene.add(new THREE.HemisphereLight(0xd8c9ff, 0x11091d, 2.4));
    const sunlight = new THREE.DirectionalLight(0xf0e8ff, 2.2);
    sunlight.position.set(-3, 3, 4);
    scene.add(sunlight);
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 96, 72),
      new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.085, side: THREE.BackSide }),
    ));

    const sharedPinGeometry = pinGeometry();
    const sharedRingGeometry = new THREE.RingGeometry(0.007, 0.0115, 32);
    const sharedCenterGeometry = new THREE.CircleGeometry(0.0047, 24);
    const markers = footprints.map((footprint) => {
      const marker = new THREE.Group();
      const surfaceNormal = globePoint(footprint.latitude, footprint.longitude).normalize();
      marker.position.copy(surfaceNormal.clone().multiplyScalar(1.031));
      marker.userData.footprintId = footprint.id;
      marker.userData.city = footprint.city;
      marker.userData.surfaceNormal = surfaceNormal;
      const borderMaterial = new THREE.MeshBasicMaterial({
        color: 0x2b1744,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const pinMaterial = new THREE.MeshBasicMaterial({
        color: 0x8f70e8,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xe3d8ff, transparent: true, opacity: 0.96, side: THREE.DoubleSide, depthWrite: false });
      const centerMaterial = new THREE.MeshBasicMaterial({ color: 0x4a2e78, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
      const shadow = new THREE.Mesh(
        sharedPinGeometry,
        new THREE.MeshBasicMaterial({ color: 0x020b10, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
      );
      shadow.scale.setScalar(1.24);
      shadow.position.set(0.003, -0.003, -0.0012);
      shadow.renderOrder = 5;
      const border = new THREE.Mesh(sharedPinGeometry, borderMaterial);
      border.scale.setScalar(1.12);
      border.position.z = -0.0005;
      border.renderOrder = 6;
      const icon = new THREE.Mesh(sharedPinGeometry, pinMaterial);
      icon.position.z = 0.0005;
      icon.renderOrder = 7;
      const ring = new THREE.Mesh(sharedRingGeometry, ringMaterial);
      ring.position.set(0, 0.055, 0.0011);
      ring.renderOrder = 8;
      const center = new THREE.Mesh(sharedCenterGeometry, centerMaterial);
      center.position.set(0, 0.055, 0.0013);
      center.renderOrder = 9;
      marker.userData.pinMaterial = pinMaterial;
      marker.userData.borderMaterial = borderMaterial;
      marker.userData.ringMaterial = ringMaterial;
      marker.userData.centerMaterial = centerMaterial;
      const hitArea = new THREE.Mesh(
        new THREE.SphereGeometry(0.062, 10, 10),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hitArea.position.y = 0.038;
      marker.add(shadow, border, icon, ring, center, hitArea);
      globe.add(marker);
      return marker;
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.045;
    controls.enablePan = false;
    controls.minDistance = 1.12;
    controls.maxDistance = 5.2;
    controls.zoomSpeed = 0.9;
    controls.zoomToCursor = false;
    controls.rotateSpeed = 0.36;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.26;
    let focusDirection: THREE.Vector3 | null = null;
    let focusDistance = camera.position.length();
    let lastFocusedId: number | null | undefined;
    const stopFocus = () => { controls.autoRotate = false; focusDirection = null; };
    controls.addEventListener("start", stopFocus);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredMarkerId: number | null = null;
    let hoveredCity = "";
    const updatePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([earth, ...markers], true)[0];
      return hit?.object === earth ? null : hit?.object.parent;
    };
    const hoverPin = (event: PointerEvent) => {
      const marker = updatePointer(event);
      hoveredMarkerId = marker?.userData.footprintId ?? null;
      hoveredCity = marker?.userData.city ?? "";
      if (hoveredMarkerId) controls.autoRotate = false;
      renderer.domElement.style.cursor = hoveredMarkerId ? "pointer" : "grab";
    };
    const clearHover = () => {
      hoveredMarkerId = null;
      hoveredCity = "";
      renderer.domElement.style.cursor = "grab";
    };
    const pick = (event: PointerEvent) => {
      const marker = updatePointer(event);
      const footprintId = marker?.userData.footprintId;
      if (footprintId) onSelectRef.current(footprintId as number);
    };
    renderer.domElement.addEventListener("pointermove", hoverPin);
    renderer.domElement.addEventListener("pointerleave", clearHover);
    renderer.domElement.addEventListener("pointerup", pick);

    const lineMaterials: LineMaterial[] = [];
    const countryMaterial = new LineMaterial({
      color: 0xb7a5d8,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      linewidth: 0.78,
    });
    lineMaterials.push(countryMaterial);
    const boundaryVisuals: Array<{ city: string; core: LineMaterial; fill: THREE.MeshBasicMaterial }> = [];
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
      color: 0x766993,
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
            if (line) { line.renderOrder = 1; globe.add(line); }
          }
        }
      })
      .catch(console.error);

    const addCityBoundary = (feature: BoundaryFeature, city: string) => {
      const coreMaterial = new LineMaterial({
        color: 0x9a7bea,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        linewidth: 1.5,
      });
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: 0x7656d8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      coreMaterial.resolution.set(mount.clientWidth, mount.clientHeight);
      lineMaterials.push(coreMaterial);
      boundaryVisuals.push({ city, core: coreMaterial, fill: fillMaterial });
      for (const polygon of boundaryPolygons(feature)) {
        const fill = mapFill(polygon, 1.013, fillMaterial);
        if (fill) globe.add(fill);
      }
      for (const ring of boundaryRings(feature)) {
        const coreLine = mapLine(ring, 1.019, coreMaterial);
        if (coreLine) { coreLine.renderOrder = 4; globe.add(coreLine); }
      }
    };

    for (const footprint of footprints) {
      if (footprint.boundary && !SEEDED_CITIES.has(footprint.city)) {
        addCityBoundary({ properties: { name: footprint.city }, geometry: footprint.boundary }, footprint.city);
      }
    }

    fetch("/visited-boundaries.json")
      .then((response) => response.json())
      .then((collection: { features: BoundaryFeature[] }) => {
        if (disposed) return;
        for (const feature of collection.features) addCityBoundary(feature, String(feature.properties.name ?? ""));
      })
      .catch(console.error);

    const animationStartedAt = performance.now();
    const cameraDirection = new THREE.Vector3();
    const markerWorldPosition = new THREE.Vector3();
    const globeWorldQuaternion = new THREE.Quaternion();
    const billboardQuaternion = new THREE.Quaternion();
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
      const orbitDistance = camera.position.length();
      const distanceRatio = THREE.MathUtils.clamp((orbitDistance - controls.minDistance) / (controls.maxDistance - controls.minDistance), 0, 1);
      controls.rotateSpeed = THREE.MathUtils.lerp(0.055, 0.42, Math.pow(distanceRatio, 0.7));
      controls.target.set(0, 0, 0);
      controls.update();
      globe.getWorldQuaternion(globeWorldQuaternion);
      billboardQuaternion.copy(globeWorldQuaternion).invert().multiply(camera.quaternion);
      const time = (performance.now() - animationStartedAt) / 1000;
      for (const marker of markers) {
        const hovered = marker.userData.footprintId === hoveredMarkerId;
        const selected = marker.userData.footprintId === selectedIdRef.current;
        marker.getWorldPosition(markerWorldPosition);
        const distance = camera.position.distanceTo(markerWorldPosition);
        const screenScale = THREE.MathUtils.clamp(distance * 0.34, 0.055, 1.45);
        const emphasis = hovered ? 1.38 : selected ? 1.06 + Math.sin(time * 2.1) * 0.02 : 1;
        const nextScale = THREE.MathUtils.lerp(marker.scale.x, screenScale * emphasis, hovered ? 0.22 : 0.14);
        marker.scale.setScalar(nextScale);
        marker.quaternion.copy(billboardQuaternion);
        const surfaceNormal = marker.userData.surfaceNormal as THREE.Vector3;
        const nextRadius = THREE.MathUtils.lerp(marker.position.length(), hovered ? 1.046 : 1.031, 0.16);
        marker.position.copy(surfaceNormal).multiplyScalar(nextRadius);
        const pinMaterial = marker.userData.pinMaterial as THREE.MeshBasicMaterial;
        const borderMaterial = marker.userData.borderMaterial as THREE.MeshBasicMaterial;
        const ringMaterial = marker.userData.ringMaterial as THREE.MeshBasicMaterial;
        const centerMaterial = marker.userData.centerMaterial as THREE.MeshBasicMaterial;
        pinMaterial.color.set(hovered ? 0xbca5ff : selected ? 0x9b80ed : 0x8066d1);
        pinMaterial.opacity = hovered ? 1 : selected ? 0.98 : 0.9;
        borderMaterial.color.set(hovered ? 0x4b2b72 : 0x2b1744);
        borderMaterial.opacity = hovered ? 1 : 0.94;
        ringMaterial.color.set(hovered ? 0xf4efff : 0xe3d8ff);
        centerMaterial.color.set(hovered ? 0x62428f : 0x4a2e78);
      }
      for (const visual of boundaryVisuals) {
        const hovered = visual.city === hoveredCity;
        const active = visual.city === selectedCityRef.current || hovered;
        visual.core.color.set(active ? 0xc2adff : 0x8b70dc);
        visual.core.opacity = active ? 0.9 : 0.7;
        visual.core.linewidth = active ? 2.2 : 1.45;
        visual.fill.opacity = active ? (hovered ? 0.39 : 0.31) + Math.sin(time * 2.1) * 0.018 : 0;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", hoverPin);
      renderer.domElement.removeEventListener("pointerleave", clearHover);
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

function GlobeBackdrop({ footprint }: { footprint: Footprint | null }) {
  const photos = footprint?.photos.length
    ? footprint.photos.map((photo) => ({ key: String(photo.id), url: photo.url }))
    : [{ key: "fallback", url: "/atlas-fallback.jpg" }];
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    if (photos.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % photos.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, [footprint?.id, photos.length]);

  return (
    <div className="globe-backdrop" aria-hidden="true">
      {photos.map((photo, index) => (
        <img
          className={index === activeIndex ? "active" : ""}
          key={`${footprint?.id ?? "fallback"}-${photo.key}`}
          src={photo.url}
          alt=""
        />
      ))}
      <div className="globe-backdrop-shade" />
    </div>
  );
}

export function GlobeDiary() {
  const [footprints, setFootprints] = useState<Footprint[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"place" | "photos">("place");
  const [cityName, setCityName] = useState("");
  const [visitedAt, setVisitedAt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const selected = useMemo(() => footprints.find((item) => item.id === selectedId) ?? footprints[0] ?? null, [footprints, selectedId]);
  const remainingPhotoSlots = Math.max(0, 5 - (formMode === "photos" ? selected?.photos.length ?? 0 : 0));
  const openPlaceForm = () => {
    setFormMode("place"); setCityName(""); setVisitedAt(""); setFiles([]); setNotice(""); setFormOpen(true);
  };
  const openPhotoForm = () => {
    if (!selected || selected.photos.length >= 5) return;
    setFormMode("photos"); setCityName(selected.city); setVisitedAt(""); setFiles([]); setNotice(""); setFormOpen(true);
  };
  const load = async (selectId?: number) => {
    const response = await fetch("/api/footprints", { cache: "no-store" });
    const data = await response.json() as { footprints?: Footprint[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "读取失败");
    const next = (data.footprints ?? []).map((item) => ({ ...item, photos: item.photos ?? [] }));
    setFootprints(next);
    setSelectedId((current) => selectId ?? current ?? next[0]?.id ?? null);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { load().catch(() => setNotice("暂时无法读取地点")); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (formMode === "photos" && !files.length) return setNotice("请选择要补充的照片");
    if (files.length > remainingPhotoSlots) return setNotice(`这个地点还能上传 ${remainingPhotoSlots} 张照片`);
    setBusy(true); setNotice("");
    const body = new FormData();
    body.set("city", cityName);
    body.set("visitedAt", visitedAt); files.forEach((file) => body.append("photos", file));
    try {
      const response = await fetch("/api/footprints", { method: "POST", body });
      const data = await response.json() as { error?: string; footprint?: { id: number } };
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      await load(data.footprint?.id); setFormOpen(false); setFiles([]); setVisitedAt(""); setCityName(""); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  };

  return (
    <main className="site-shell">
      <header className="topbar"><p className="brand-wordmark">MAKE LOVE ATLAS</p><button className="add-button" type="button" onClick={openPlaceForm}>添加地点 / 照片</button></header>
      <section className="workspace">
        <div className="globe-stage">
          <GlobeBackdrop key={selected?.id ?? "fallback"} footprint={selected} />
          <GlobeCanvas footprints={footprints} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          <p className="globe-hint">移入图钉预览紫色填充 · 点击切换城市照片 · 拖动旋转，滚轮放大</p>
        </div>
        <aside className="places-panel">
          <div className="panel-heading"><span>已记录地点</span><strong>{footprints.length}</strong></div>
          <div className="places-list">{footprints.map((item) => (
            <button className={selected?.id === item.id ? "place-row active" : "place-row"} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
              <span className="place-dot" /><span><b>{item.city}</b><small>{item.country}</small></span><span className="place-count">{item.photos.length || "—"}</span>
            </button>
          ))}</div>
          {selected && <div className="selection-panel" key={selected.id}>
            <div className="selection-title"><div><span>{selected.country}</span><h2>{selected.city}</h2></div>{selected.visitedAt && <time>{selected.visitedAt}</time>}</div>
            <div className="boundary-status"><i /><span>城市已选中</span><small>紫色填充为 {selected.city} 的行政区域</small></div>
            <button className="add-photos-button" type="button" onClick={openPhotoForm} disabled={selected.photos.length >= 5}>
              <span>{selected.photos.length >= 5 ? "照片已满" : "继续添加照片"}</span>
              <small>{selected.photos.length} / 5</small>
            </button>
            <PhotoStack key={selected.id} footprint={selected} />
          </div>}
        </aside>
      </section>
      <footer>世界地图：Natural Earth · 城市边界：© OpenStreetMap contributors</footer>
      {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setFormOpen(false); }}>
        <form className="location-form" onSubmit={submit}>
          <div className="form-heading"><div><p className="eyebrow">{formMode === "photos" ? "ADD PHOTOS" : "NEW PLACE"}</p><h2>{formMode === "photos" ? `补充 ${selected?.city ?? "城市"} 的照片` : "添加地点 / 照片"}</h2></div><button type="button" onClick={() => setFormOpen(false)} aria-label="关闭">×</button></div>
          <label>城市名称<input value={cityName} required readOnly={formMode === "photos"} placeholder="例如：深圳" autoComplete="off" onChange={(event) => setCityName(event.target.value)} /></label>
          {formMode === "place" && <><p className="city-lookup-note">保存时会自动识别国家、位置和城市行政边界</p><label>日期（可选）<input type="date" value={visitedAt} onChange={(event) => setVisitedAt(event.target.value)} /></label></>}
          <label>照片（还可添加 {remainingPhotoSlots} 张）<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => { const chosen = Array.from(event.target.files ?? []); const next = chosen.slice(0, remainingPhotoSlots); setFiles(next); setNotice(chosen.length > remainingPhotoSlots ? `只会保留前 ${remainingPhotoSlots} 张照片` : ""); }} /></label>
          {files.length > 0 && <div className="file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}
          {notice && <p className="form-notice">{notice}</p>}
          <button className="submit-button" type="submit" disabled={busy}>{busy ? "正在保存…" : formMode === "photos" ? "添加到照片集" : "保存地点"}</button>
        </form>
      </div>}
    </main>
  );
}
