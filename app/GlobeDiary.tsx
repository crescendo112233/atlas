"use client";

import { FormEvent, KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type Footprint = {
  id: number;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  visitedAt: string;
  memory: string;
  createdAt: string;
};

type Point = { latitude: number; longitude: number };

const HOME_BASES = [
  { city: "深圳", country: "中国", latitude: 22.5431, longitude: 114.0579 },
  { city: "新加坡", country: "新加坡", latitude: 1.3521, longitude: 103.8198 },
];

const PRESETS = [
  ...HOME_BASES,
  { city: "香港", country: "中国", latitude: 22.3193, longitude: 114.1694 },
  { city: "曼谷", country: "泰国", latitude: 13.7563, longitude: 100.5018 },
  { city: "巴厘岛", country: "印度尼西亚", latitude: -8.4095, longitude: 115.1889 },
  { city: "东京", country: "日本", latitude: 35.6762, longitude: 139.6503 },
  { city: "首尔", country: "韩国", latitude: 37.5665, longitude: 126.978 },
  { city: "悉尼", country: "澳大利亚", latitude: -33.8688, longitude: 151.2093 },
  { city: "巴黎", country: "法国", latitude: 48.8566, longitude: 2.3522 },
  { city: "伦敦", country: "英国", latitude: 51.5072, longitude: -0.1276 },
  { city: "纽约", country: "美国", latitude: 40.7128, longitude: -74.006 },
];

const CONTINENTS: Array<Array<[number, number]>> = [
  [[-168, 66], [-141, 70], [-124, 58], [-123, 48], [-110, 31], [-97, 18], [-82, 24], [-68, 47], [-58, 54], [-80, 72], [-105, 78], [-145, 72], [-168, 66]],
  [[-81, 12], [-70, 8], [-52, -5], [-35, -10], [-48, -29], [-60, -50], [-72, -43], [-78, -15], [-81, 12]],
  [[-10, 36], [2, 50], [25, 57], [45, 50], [64, 58], [95, 76], [150, 63], [170, 49], [137, 34], [121, 18], [105, 4], [82, 8], [66, 24], [46, 29], [34, 35], [20, 32], [8, 38], [-10, 36]],
  [[-17, 35], [8, 37], [30, 30], [43, 12], [36, -12], [20, -35], [5, -34], [-8, -5], [-17, 15], [-17, 35]],
  [[112, -12], [132, -11], [153, -27], [145, -42], [121, -34], [112, -12]],
  [[-53, 60], [-43, 82], [-18, 80], [-25, 63], [-53, 60]],
  [[47, -14], [50, -25], [44, -25], [43, -16], [47, -14]],
];

const rad = (value: number) => (value * Math.PI) / 180;
const deg = (value: number) => (value * 180) / Math.PI;

function project(latitude: number, longitude: number, rotation: number, tilt: number) {
  const lat = rad(latitude);
  const lon = rad(longitude) + rotation;
  const x = Math.cos(lat) * Math.sin(lon);
  const y = Math.sin(lat);
  const z = Math.cos(lat) * Math.cos(lon);
  return {
    x,
    y: y * Math.cos(tilt) - z * Math.sin(tilt),
    z: y * Math.sin(tilt) + z * Math.cos(tilt),
  };
}

function inverseProject(x: number, y: number, rotation: number, tilt: number): Point | null {
  const distance = x * x + y * y;
  if (distance > 1) return null;
  const z2 = Math.sqrt(1 - distance);
  const originalY = y * Math.cos(tilt) + z2 * Math.sin(tilt);
  const originalZ = -y * Math.sin(tilt) + z2 * Math.cos(tilt);
  return {
    latitude: Math.max(-90, Math.min(90, deg(Math.asin(originalY)))),
    longitude: ((((deg(Math.atan2(x, originalZ)) - deg(rotation)) + 540) % 360) - 180),
  };
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 18, size / 18);
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.bezierCurveTo(-15, -5, -9, -15, 0, -7);
  ctx.bezierCurveTo(9, -15, 15, -5, 0, 5);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.restore();
}

function GlobeCanvas({ footprints, onChoose }: { footprints: Footprint[]; onChoose: (point: Point) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(rad(-112));
  const tilt = useRef(rad(-5));
  const dragging = useRef(false);
  const moved = useRef(0);
  const lastPoint = useRef({ x: 0, y: 0 });
  const frame = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let radius = 0;
    let cx = 0;
    let cy = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      radius = Math.min(width, height) * 0.42;
      cx = width / 2;
      cy = height / 2;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawLine = (points: Array<[number, number]>, stroke: string, lineWidth: number, close = false) => {
      ctx.beginPath();
      let drawing = false;
      for (const [longitude, latitude] of points) {
        const p = project(latitude, longitude, rotation.current, tilt.current);
        if (p.z > 0) {
          const x = cx + p.x * radius;
          const y = cy - p.y * radius;
          if (!drawing) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          drawing = true;
        } else {
          drawing = false;
        }
      }
      if (close) ctx.closePath();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      if (close) {
        ctx.fillStyle = "rgba(255, 190, 208, 0.08)";
        ctx.fill();
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      if (!dragging.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        rotation.current += 0.00045;
      }

      const halo = ctx.createRadialGradient(cx, cy, radius * 0.72, cx, cy, radius * 1.34);
      halo.addColorStop(0, "rgba(255, 105, 151, .16)");
      halo.addColorStop(0.72, "rgba(255, 105, 151, .08)");
      halo.addColorStop(1, "rgba(255, 105, 151, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.34, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      const globe = ctx.createRadialGradient(cx - radius * 0.38, cy - radius * 0.4, radius * 0.04, cx, cy, radius * 1.1);
      globe.addColorStop(0, "#fffcfb");
      globe.addColorStop(0.22, "#f9d8df");
      globe.addColorStop(0.62, "#c54b74");
      globe.addColorStop(1, "#49162e");
      ctx.fillStyle = globe;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

      for (let latitude = -60; latitude <= 60; latitude += 30) {
        const points: Array<[number, number]> = [];
        for (let longitude = -180; longitude <= 180; longitude += 3) points.push([longitude, latitude]);
        drawLine(points, "rgba(255,255,255,.16)", 0.7);
      }
      for (let longitude = -180; longitude < 180; longitude += 30) {
        const points: Array<[number, number]> = [];
        for (let latitude = -90; latitude <= 90; latitude += 3) points.push([longitude, latitude]);
        drawLine(points, "rgba(255,255,255,.13)", 0.7);
      }
      CONTINENTS.forEach((shape) => drawLine(shape, "rgba(255,242,244,.56)", 1.15, true));
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.75)";
      ctx.lineWidth = 1.2;
      ctx.shadowColor = "rgba(255,178,204,.8)";
      ctx.shadowBlur = 22;
      ctx.stroke();
      ctx.shadowBlur = 0;

      HOME_BASES.forEach((base) => {
        const p = project(base.latitude, base.longitude, rotation.current, tilt.current);
        if (p.z <= 0) return;
        const x = cx + p.x * radius;
        const y = cy - p.y * radius;
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,245,225,.9)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,245,225,.7)";
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });

      footprints.forEach((footprint) => {
        const p = project(footprint.latitude, footprint.longitude, rotation.current, tilt.current);
        if (p.z <= 0) return;
        drawHeart(ctx, cx + p.x * radius, cy - p.y * radius, 15 + p.z * 4, "#fff2dd");
      });

      frame.current = requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    draw();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [footprints]);

  const canvasCoordinates = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) * 0.42;
    return {
      x: (event.clientX - rect.left - rect.width / 2) / radius,
      y: -(event.clientY - rect.top - rect.height / 2) / radius,
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    moved.current = 0;
    lastPoint.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const dx = event.clientX - lastPoint.current.x;
    const dy = event.clientY - lastPoint.current.y;
    rotation.current += dx * 0.008;
    tilt.current = Math.max(rad(-45), Math.min(rad(45), tilt.current - dy * 0.005));
    moved.current += Math.abs(dx) + Math.abs(dy);
    lastPoint.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    dragging.current = false;
    if (moved.current < 8) {
      const point = canvasCoordinates(event);
      const chosen = inverseProject(point.x, point.y, rotation.current, tilt.current);
      if (chosen) onChoose(chosen);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "ArrowLeft") rotation.current -= 0.12;
    if (event.key === "ArrowRight") rotation.current += 0.12;
    if (event.key === "ArrowUp") tilt.current = Math.min(rad(45), tilt.current + 0.08);
    if (event.key === "ArrowDown") tilt.current = Math.max(rad(-45), tilt.current - 0.08);
    if (event.key.startsWith("Arrow")) event.preventDefault();
  };

  return (
    <canvas
      ref={canvasRef}
      className="globe-canvas"
      aria-label="可旋转的足迹地球，拖动或使用方向键旋转，轻点地球可以选择新位置"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { dragging.current = false; }}
      onKeyDown={handleKeyDown}
    />
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function GlobeDiary() {
  const [footprints, setFootprints] = useState<Footprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    city: "",
    country: "",
    latitude: "22.5431",
    longitude: "114.0579",
    visitedAt: new Date().toISOString().slice(0, 10),
    memory: "",
  });

  useEffect(() => {
    fetch("/api/footprints", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setFootprints(data.footprints);
      })
      .catch(() => setNotice("云端足迹暂时没有连上，请稍后刷新"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const stats = useMemo(() => {
    const countries = new Set(footprints.map((item) => item.country)).size;
    const first = footprints.length ? [...footprints].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))[0] : null;
    return { countries, first: first ? formatDate(first.visitedAt) : "等待第一颗心亮起" };
  }, [footprints]);

  const openAtPoint = (point?: Point) => {
    setForm((current) => ({
      ...current,
      latitude: (point?.latitude ?? Number(current.latitude)).toFixed(4),
      longitude: (point?.longitude ?? Number(current.longitude)).toFixed(4),
    }));
    setPanelOpen(true);
  };

  const choosePreset = (value: string) => {
    const preset = PRESETS[Number(value)];
    if (!preset) return;
    setForm((current) => ({
      ...current,
      city: preset.city,
      country: preset.country,
      latitude: String(preset.latitude),
      longitude: String(preset.longitude),
    }));
  };

  const saveFootprint = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/footprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, latitude: Number(form.latitude), longitude: Number(form.longitude) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setFootprints((current) => [data.footprint, ...current]);
      setPanelOpen(false);
      setForm((current) => ({ ...current, city: "", country: "", memory: "" }));
      setNotice("新的心动坐标已经点亮 ♡");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "暂时没有保存成功");
    } finally {
      setSaving(false);
    }
  };

  const removeFootprint = async (item: Footprint) => {
    if (!window.confirm(`要移除 ${item.city} 这条足迹吗？`)) return;
    const response = await fetch(`/api/footprints?id=${item.id}`, { method: "DELETE" });
    if (response.ok) {
      setFootprints((current) => current.filter((footprint) => footprint.id !== item.id));
      setNotice("这条足迹已经移除");
    } else {
      setNotice("暂时没有移除成功");
    }
  };

  return (
    <main className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="回到顶部">
          <span className="brand-mark">♡</span>
          <span>我们的星球日记</span>
        </a>
        <div className="together-pill"><span className="live-dot" /> 深圳 <span>✦</span> 新加坡</div>
        <button className="add-button compact" type="button" onClick={() => openAtPoint()}>
          <span>＋</span> 点亮新坐标
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">TWO HEARTS · ONE PLANET</p>
          <h1>每一次相见，<br />都让这颗星球<br /><em>更亮一点。</em></h1>
          <p className="intro">把只属于你们的城市收藏起来，慢慢绘成一张跨越海洋的亲密地图。</p>
          <div className="hero-actions">
            <button className="add-button" type="button" onClick={() => openAtPoint()}><span>＋</span> 记录一个地方</button>
            <span className="privacy-note"><span>⌁</span> 仅你们可见 · 云端同步</span>
          </div>
          <dl className="stats">
            <div><dt>{footprints.length}</dt><dd>心动坐标</dd></div>
            <div><dt>{stats.countries}</dt><dd>个国家 / 地区</dd></div>
            <div className="first-date"><dt>{stats.first}</dt><dd>故事开始的地方</dd></div>
          </dl>
        </div>

        <div className="globe-stage">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="bubble bubble-one" />
          <span className="bubble bubble-two" />
          <span className="bubble bubble-three" />
          <GlobeCanvas footprints={footprints} onChoose={openAtPoint} />
          <div className="globe-hint"><span>↔</span> 拖动旋转 · 轻点选择位置</div>
          <div className="base-label shenzhen-label">深圳 <span>现在的你</span></div>
          <div className="base-label singapore-label">新加坡 <span>现在的她</span></div>
        </div>
      </section>

      <section className="memories" aria-labelledby="memory-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OUR LITTLE CONSTELLATION</p>
            <h2 id="memory-title">心动坐标</h2>
          </div>
          <p>每一颗心，都是你们共同保守的小秘密。</p>
        </div>

        {loading ? (
          <div className="empty-state"><span className="empty-heart pulse">♡</span><h3>正在翻开你们的日记</h3></div>
        ) : footprints.length === 0 ? (
          <div className="empty-state">
            <span className="empty-heart">♡</span>
            <h3>第一颗心，等你们来点亮</h3>
            <p>点击上面的地球选择位置，或者直接从常用城市开始。</p>
            <button className="text-button" type="button" onClick={() => openAtPoint()}>记录第一段回忆 <span>→</span></button>
          </div>
        ) : (
          <div className="memory-grid">
            {footprints.map((item, index) => (
              <article className="memory-card" key={item.id}>
                <div className="memory-number">{String(footprints.length - index).padStart(2, "0")}</div>
                <div className="memory-pin">♥</div>
                <p className="memory-date">{formatDate(item.visitedAt)}</p>
                <h3>{item.city}</h3>
                <p className="memory-country">{item.country}</p>
                {item.memory && <blockquote>“{item.memory}”</blockquote>}
                <button className="delete-button" type="button" onClick={() => removeFootprint(item)} aria-label={`移除 ${item.city} 足迹`}>移除</button>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>Made for two, kept between two.</span>
        <span className="footer-heart">♡</span>
        <span>从深圳到新加坡，再到世界的每一个角落</span>
      </footer>

      {panelOpen && (
        <div className="panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanelOpen(false); }}>
          <aside className="add-panel" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <button className="close-button" type="button" onClick={() => setPanelOpen(false)} aria-label="关闭">×</button>
            <p className="eyebrow">A NEW LITTLE SECRET</p>
            <h2 id="add-title">点亮一个新坐标</h2>
            <p className="panel-intro">地点和回忆会一起保存到你们的私密星球。</p>
            <form onSubmit={saveFootprint}>
              <label className="field full">
                <span>快速定位</span>
                <select defaultValue="" onChange={(event) => choosePreset(event.target.value)}>
                  <option value="" disabled>选择常用城市，或在地球上轻点</option>
                  {PRESETS.map((preset, index) => <option value={index} key={`${preset.city}-${index}`}>{preset.city} · {preset.country}</option>)}
                </select>
              </label>
              <div className="form-row">
                <label className="field"><span>城市</span><input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="例如：京都" autoFocus /></label>
                <label className="field"><span>国家 / 地区</span><input required value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} placeholder="例如：日本" /></label>
              </div>
              <label className="field full"><span>日期</span><input type="date" required value={form.visitedAt} onChange={(event) => setForm({ ...form, visitedAt: event.target.value })} /></label>
              <label className="field full"><span>留一句悄悄话 <small>可选</small></span><textarea maxLength={280} value={form.memory} onChange={(event) => setForm({ ...form, memory: event.target.value })} placeholder="那天最想记住的一个瞬间……" /></label>
              <details className="coordinates">
                <summary>调整精确位置</summary>
                <div className="form-row">
                  <label className="field"><span>纬度</span><input type="number" step="0.0001" min="-90" max="90" required value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label>
                  <label className="field"><span>经度</span><input type="number" step="0.0001" min="-180" max="180" required value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label>
                </div>
              </details>
              <button className="save-button" type="submit" disabled={saving}>{saving ? "正在点亮……" : "把这颗心放上地球 ♥"}</button>
            </form>
          </aside>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
