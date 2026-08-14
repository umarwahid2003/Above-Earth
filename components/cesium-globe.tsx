"use client";

import { useEffect, useRef } from "react";
import type * as CesiumNS from "cesium";
import type { SatRec } from "satellite.js";
import type { SatelliteCategory } from "@/data/tles";
import { filterSatellites } from "@/lib/filter";
import { satelliteSprite, satelliteSpriteBright } from "@/lib/satellite-sprite";
import type { CatalogRecord, SatelliteRecord } from "@/lib/types";
import { useSatelliteStore } from "@/store/satellites";
import {
  buildOrbitSnapshots,
  formatAltitude,
  formatVelocity,
  parseOrbit,
  EARTH_RADIUS_KM,
  type OrbitSnapshot,
} from "@/lib/orbits";

import { twoline2satrec } from "@/lib/satellite/io.js";
import { propagate, gstime } from "@/lib/satellite/propagation.js";
import { eciToEcf } from "@/lib/satellite/transforms.js";

type PropagatedSat = {
  id: string;
  name: string;
  noradId: number;
  category: SatelliteCategory;
  satrec: SatRec;
};

type FullPropagated = {
  record: CatalogRecord;
  satrec: SatRec;
  point: CesiumNS.PointPrimitive;
  eci: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
  simMs: number;
  visible: boolean;
  flyRangeM: number;
};

type StarDot = {
  x: number;
  y: number;
  r: number;
  alpha: number;
};

const TRAIL_MAX_POINTS = 700;
const TRAIL_MIN_STEP_M = 2000;
const ALL_PATH_SAMPLES = 160;
const ALL_PATH_REBUILD_MS = 4000;
const METRICS_FLUSH_MS = 200;
const SPRITE_BASE = 0.85;
const SPRITE_HOVER = 1.0;
const SPRITE_SELECTED = 1.15;

// Full Catalog: thousands of objects are batched into one point collection and
// refreshed on a rolling slice so no single frame pays for a full SGP4 pass.
const FULL_POINT_PIXEL = 2.2;
const FULL_POINT_HOVER_PIXEL = 3.8;
const FULL_POINT_ALPHA = 0.55;
const FULL_POINT_HOVER_ALPHA = 0.95;
const FULL_SLICE_FRAMES = 12;
const FULL_BUILD_CHUNK = 2500;

// Background starfield is hidden at default/close zoom and fades in only as
// the camera pulls far back, so the default view stays a clean black void.
const STARFIELD_SIZE = 256;
const STAR_COUNT = 130;
const STAR_FADE_START_M = 60_000_000;
const STAR_FADE_END_M = 160_000_000;
const STAR_FADE_TAU_MS = 170;
const STAR_REDRAW_EPS = 0.02;
const STAR_REDRAW_MIN_MS = 90;

// Category differentiation is communicated with size and opacity only.
const CATEGORY_SCALE: Record<SatelliteCategory, number> = {
  "ISS/Crewed": 1.0,
  Communications: 0.92,
  "GPS/Navigation": 0.92,
  Weather: 0.84,
  Science: 0.88,
};

const CATEGORY_ALPHA: Record<SatelliteCategory, number> = {
  "ISS/Crewed": 1,
  Communications: 0.9,
  "GPS/Navigation": 0.9,
  Weather: 0.78,
  Science: 0.86,
};
const MODEL_URI = "/models/satellite.gltf";
const MODEL_TURN_RAD_PER_S = 0.7;

type GlobeApi = {
  applyDataset: (records: SatelliteRecord[]) => void;
  applyOrbitMode: () => void;
  applyOverlay: (
    kind: "earth" | "borders" | "grid" | "cities",
    on: boolean
  ) => void;
  applyCatalogMode: () => void;
  applyFullCatalog: () => void;
  applyFullVisibility: () => void;
  applyCameraMode: () => void;
  resetView: () => void;
};

export default function CesiumGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  const satellites = useSatelliteStore((state) => state.satellites);
  const selectedId = useSatelliteStore((state) => state.selectedId);
  const setSelectedId = useSatelliteStore((state) => state.setSelectedId);
  const running = useSatelliteStore((state) => state.running);
  const live = useSatelliteStore((state) => state.live);
  const multiplier = useSatelliteStore((state) => state.multiplier);
  const setReady = useSatelliteStore((state) => state.setReady);
  const setValidCount = useSatelliteStore((state) => state.setValidCount);
  const setLiveMetrics = useSatelliteStore((state) => state.setLiveMetrics);
  const showEarthImg = useSatelliteStore((state) => state.showEarthImg);
  const showBorders = useSatelliteStore((state) => state.showBorders);
  const showGrid = useSatelliteStore((state) => state.showGrid);
  const showCities = useSatelliteStore((state) => state.showCities);
  const orbitMode = useSatelliteStore((state) => state.orbitMode);
  const query = useSatelliteStore((state) => state.query);
  const category = useSatelliteStore((state) => state.category);
  const catalogMode = useSatelliteStore((state) => state.catalogMode);
  const fullCatalog = useSatelliteStore((state) => state.fullCatalog);
  const showActive = useSatelliteStore((state) => state.showActive);
  const showRocketBodies = useSatelliteStore((state) => state.showRocketBodies);
  const showDebris = useSatelliteStore((state) => state.showDebris);
  const cameraMode = useSatelliteStore((state) => state.cameraMode);
  const resetSignal = useSatelliteStore((state) => state.resetSignal);

  const viewerRef = useRef<CesiumNS.Viewer | null>(null);
  const cesiumRef = useRef<typeof CesiumNS | null>(null);
  const apiRef = useRef<GlobeApi | null>(null);
  const runningRef = useRef(running);
  const liveRef = useRef(live);
  const multiplierRef = useRef(multiplier);
  const selectedIdRef = useRef(selectedId);
  const dataRef = useRef<SatelliteRecord[]>(satellites);
  const cameraModeRef = useRef(cameraMode);
  const orbitModeRef = useRef(orbitMode);
  const queryRef = useRef(query);
  const categoryRef = useRef(category);
  const catalogModeRef = useRef(catalogMode);
  const fullCatalogRef = useRef<CatalogRecord[]>(fullCatalog);
  const onSelectedChangeRef = useRef<
    ((id: string | null, fly: boolean) => void) | null
  >(null);

  useEffect(() => {
    const wasRunning = runningRef.current;
    runningRef.current = running;
    if (viewerRef.current) {
      viewerRef.current.clock.shouldAnimate = running;
      if (running && !wasRunning && liveRef.current && cesiumRef.current) {
        viewerRef.current.clock.currentTime =
          cesiumRef.current.JulianDate.now();
      }
    }
  }, [running]);

  useEffect(() => {
    liveRef.current = live;
    multiplierRef.current = multiplier;
    if (viewerRef.current) {
      viewerRef.current.clock.multiplier = live ? 1 : multiplier;
      if (live && cesiumRef.current) {
        viewerRef.current.clock.currentTime =
          cesiumRef.current.JulianDate.now();
      }
    }
  }, [live, multiplier]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    onSelectedChangeRef.current?.(selectedId, true);
  }, [selectedId]);

  useEffect(() => {
    dataRef.current = satellites;
    apiRef.current?.applyDataset(satellites);
  }, [satellites]);

  useEffect(() => {
    queryRef.current = query;
    categoryRef.current = category;
    apiRef.current?.applyOrbitMode();
  }, [query, category]);

  useEffect(() => {
    orbitModeRef.current = orbitMode;
    apiRef.current?.applyOrbitMode();
  }, [orbitMode]);

  useEffect(() => {
    catalogModeRef.current = catalogMode;
    apiRef.current?.applyCatalogMode();
  }, [catalogMode]);

  useEffect(() => {
    fullCatalogRef.current = fullCatalog;
    apiRef.current?.applyFullCatalog();
  }, [fullCatalog]);

  useEffect(() => {
    apiRef.current?.applyFullVisibility();
  }, [showActive, showRocketBodies, showDebris]);

  useEffect(() => {
    apiRef.current?.applyOverlay("earth", showEarthImg);
  }, [showEarthImg]);
  useEffect(() => {
    apiRef.current?.applyOverlay("borders", showBorders);
  }, [showBorders]);
  useEffect(() => {
    apiRef.current?.applyOverlay("grid", showGrid);
  }, [showGrid]);
  useEffect(() => {
    apiRef.current?.applyOverlay("cities", showCities);
  }, [showCities]);

  useEffect(() => {
    const prev = cameraModeRef.current;
    cameraModeRef.current = cameraMode;
    apiRef.current?.applyCameraMode();
    if (prev === "pov" && cameraMode === "free") {
      onSelectedChangeRef.current?.(selectedIdRef.current, true);
    }
  }, [cameraMode]);

  useEffect(() => {
    if (resetSignal > 0) {
      apiRef.current?.resetView();
    }
  }, [resetSignal]);

  useEffect(() => {
    let viewer: CesiumNS.Viewer | null = null;
    let isCancelled = false;
    let removeTickListener: (() => void) | null = null;
    let removeCameraChanged: (() => void) | null = null;
    let screenSpaceHandler: CesiumNS.ScreenSpaceEventHandler | null = null;
    let hoveredIdRef: string | null = null;
    let starRaf = 0;
    // Full Catalog point building is chunked across macrotasks so the main
    // thread yields during the one-time satrec parse of thousands of records.
    let fullBuildTimer = 0;
    let fullBuildToken = 0;

    async function init() {
      try {
        const cesiumWindow = window as unknown as {
          CESIUM_BASE_URL?: string;
          Cesium?: typeof CesiumNS;
        };
        cesiumWindow.CESIUM_BASE_URL = "/cesium";

        const Cesium =
          cesiumWindow.Cesium ?? (await import("cesium"));

        const buildUrl = Cesium.buildModuleUrl as unknown as {
          setBaseUrl?: (url: string) => void;
        };
        if (typeof buildUrl?.setBaseUrl === "function") {
          buildUrl.setBaseUrl("/cesium/");
        }

        if (isCancelled || !containerRef.current) return;
        cesiumRef.current = Cesium;

        const container = containerRef.current;

        const cesiumViewer = new Cesium.Viewer(container, {
          baseLayer: false,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          shouldAnimate: true,
        });

      viewer = cesiumViewer;
      viewerRef.current = cesiumViewer;

      const scene = cesiumViewer.scene;
      const globe = scene.globe;

      // Monochrome UI scene setup: matte black globe base for the imagery-off
      // state, a restrained starfield (faded in only when zoomed far out), and
      // a subtle blue atmospheric rim with realistic sun lighting (kept
      // full-colour for the Earth imagery).
      globe.baseColor = Cesium.Color.fromCssColorString("#0a0a0a");
      globe.enableLighting = false;
      globe.showGroundAtmosphere = true;
      scene.fog.enabled = true;
      scene.backgroundColor = Cesium.Color.fromCssColorString("#050505");

      // Canvas-generated restrained monochrome starfield skybox. Sparse, small,
      // dim stars; hidden entirely at default/close zoom so satellites stay the
      // clearest element on screen.
      const starPattern: StarDot[] = [];
      for (let i = 0; i < STAR_COUNT; i++) {
        starPattern.push({
          x: Math.random() * STARFIELD_SIZE,
          y: Math.random() * STARFIELD_SIZE,
          r: Math.random() * 0.6 + 0.35,
          alpha: Math.random() * 0.3 + 0.15,
        });
      }

      let starTarget = 0;
      let starCurrent = 0;
      let starRendered = 0;
      let starLastMs = 0;
      let starLastDrawMs = 0;
      let starSkyBox: CesiumNS.SkyBox | null = null;

      const drawStarfield = (multiplier: number): HTMLCanvasElement => {
        const canvas = document.createElement("canvas");
        canvas.width = STARFIELD_SIZE;
        canvas.height = STARFIELD_SIZE;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#050505";
          ctx.fillRect(0, 0, STARFIELD_SIZE, STARFIELD_SIZE);
          for (const star of starPattern) {
            const alpha = star.alpha * multiplier;
            if (alpha <= 0.004) continue;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        return canvas;
      };

      const applyStarOpacity = (opacity: number): void => {
        if (opacity <= 0.004) {
          if (starSkyBox) starSkyBox.show = false;
          return;
        }
        const canvas = drawStarfield(Math.min(1, opacity));
        const sources = {
          positiveX: canvas,
          negativeX: canvas,
          positiveY: canvas,
          negativeY: canvas,
          positiveZ: canvas,
          negativeZ: canvas,
        };
        if (!starSkyBox) {
          starSkyBox = new Cesium.SkyBox({ sources, show: false });
          scene.skyBox = starSkyBox;
        }
        starSkyBox.show = true;
        starSkyBox.sources = sources;
      };

      // Replace the Viewer's default skybox up front so the background is a
      // clean black void until the camera pulls far enough out to fade stars in.
      const blankStarfield = drawStarfield(0);
      starSkyBox = new Cesium.SkyBox({
        sources: {
          positiveX: blankStarfield,
          negativeX: blankStarfield,
          positiveY: blankStarfield,
          negativeY: blankStarfield,
          positiveZ: blankStarfield,
          negativeZ: blankStarfield,
        },
        show: false,
      });
      scene.skyBox = starSkyBox;

      const starOpacityForHeight = (height: number): number => {
        const t = Math.min(
          1,
          Math.max(0, (height - STAR_FADE_START_M) / (STAR_FADE_END_M - STAR_FADE_START_M))
        );
        return t * t * (3 - 2 * t);
      };

      // Self-terminating animation loop: runs only while the eased opacity is
      // still converging, so idle frames do no per-frame star work.
      const starFrame = (ms: number): void => {
        starRaf = 0;
        const dt = starLastMs ? ms - starLastMs : STAR_FADE_TAU_MS;
        starLastMs = ms;
        starCurrent +=
          (starTarget - starCurrent) * (1 - Math.exp(-dt / STAR_FADE_TAU_MS));
        if (
          Math.abs(starCurrent - starRendered) >= STAR_REDRAW_EPS &&
          ms - starLastDrawMs >= STAR_REDRAW_MIN_MS
        ) {
          starLastDrawMs = ms;
          starRendered = starCurrent;
          applyStarOpacity(starRendered);
        }
        if (Math.abs(starCurrent - starTarget) > 0.003) {
          starRaf = requestAnimationFrame(starFrame);
        }
      };

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

      const onCameraChanged = (): void => {
        const cartographic = cesiumViewer.camera.positionCartographic;
        if (!cartographic) return;
        starTarget = starOpacityForHeight(cartographic.height);
        if (reducedMotion.matches) {
          starCurrent = starTarget;
          if (Math.abs(starCurrent - starRendered) >= STAR_REDRAW_EPS) {
            starRendered = starCurrent;
            applyStarOpacity(starRendered);
          }
          return;
        }
        if (starRaf === 0 && Math.abs(starCurrent - starTarget) > 0.003) {
          starLastMs = 0;
          starRaf = requestAnimationFrame(starFrame);
        }
      };

      cesiumViewer.camera.percentageChanged = 0.1;
      removeCameraChanged = cesiumViewer.camera.changed.addEventListener(
        onCameraChanged
      );

      const makeProvider = (
        url: string,
        credit: string
      ): CesiumNS.UrlTemplateImageryProvider => {
        const provider = new Cesium.UrlTemplateImageryProvider({
          url,
          credit,
        });
        provider.errorEvent.addEventListener(() => {});
        return provider;
      };

      const earth = cesiumViewer.imageryLayers.addImageryProvider(
        makeProvider(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          "Imagery tiles © Esri"
        )
      );
      earth.contrast = 1.06;
      earth.show = useSatelliteStore.getState().showEarthImg;

      const grid = cesiumViewer.imageryLayers.addImageryProvider(
        new Cesium.GridImageryProvider({
          cells: 8,
          color: Cesium.Color.fromCssColorString("rgba(255, 255, 255, 0.28)"),
          glowColor: Cesium.Color.fromCssColorString("rgba(255, 255, 255, 0.05)"),
          glowWidth: 4,
          backgroundColor: Cesium.Color.TRANSPARENT,
        })
      );
      grid.alpha = 0.6;
      grid.show = useSatelliteStore.getState().showGrid;

      // Reference overlays are desaturated per-layer so borders and labels
      // stay subtle grey annotations on top of the full-colour Earth.
      const borders = cesiumViewer.imageryLayers.addImageryProvider(
        makeProvider(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          "Boundaries © Esri"
        )
      );
      borders.alpha = 0.5;
      borders.saturation = 0;
      borders.show = useSatelliteStore.getState().showBorders;

      const cities = cesiumViewer.imageryLayers.addImageryProvider(
        makeProvider(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}",
          "Place labels © Esri"
        )
      );
      cities.alpha = 0.65;
      cities.saturation = 0;
      cities.show = useSatelliteStore.getState().showCities;

      const clock = cesiumViewer.clock;
      clock.currentTime = Cesium.JulianDate.now();
      clock.clockRange = Cesium.ClockRange.UNBOUNDED;
      clock.shouldAnimate = runningRef.current;
      clock.multiplier = liveRef.current ? 1 : multiplierRef.current;

      cesiumViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(15, 22, 40_000_000),
      });

      const currentPositions = new Map<string, CesiumNS.Cartesian3>();
      const entities = new Map<string, CesiumNS.Entity>();
      const categoryById = new Map<string, SatelliteCategory>();
      const propagated: PropagatedSat[] = [];
      const satrecMap = new Map<string, PropagatedSat>();
      let snapshotMap = new Map<string, OrbitSnapshot>();

      // Full Catalog: thousands of objects rendered as one batched point
      // collection. Positions come from a rolling SGP4 slice plus cheap
      // linear extrapolation, so no single frame does a full SGP4 pass.
      const fullRecords = new Map<string, FullPropagated>();
      const fullVisible: FullPropagated[] = [];
      let fullCollection: CesiumNS.PointPrimitiveCollection | null = null;
      let fullModeActive = false;
      let selectedFullId: string | null = null;
      let fullSliceIndex = 0;
      const fullHoverPosition: { current: CesiumNS.Cartesian3 | null } = {
        current: null,
      };

      const createEntity = (record: SatelliteRecord) => {
        categoryById.set(record.id, record.category);
        const entity = cesiumViewer.entities.add({
          id: record.id,
          name: record.name,
          position: new Cesium.CallbackPositionProperty(
            () => currentPositions.get(record.id),
            false
          ),
          billboard: {
            image: satelliteSprite(record.category),
            scale: new Cesium.ConstantProperty(SPRITE_BASE),
            color: Cesium.Color.WHITE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: record.name,
            font: "bold 12px sans-serif",
            fillColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString(
              "rgba(5, 5, 5, 0.85)"
            ),
            backgroundPadding: new Cesium.Cartesian2(8, 5),
            pixelOffset: new Cesium.Cartesian2(0, -26),
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: false,
          },
        });
        entities.set(record.id, entity);
      };

      const rebuildPropagated = (records: SatelliteRecord[]) => {
        const parsed: PropagatedSat[] = [];
        const now = Cesium.JulianDate.toDate(clock.currentTime);
        const gmst = gstime(now);
        for (const record of records) {
          try {
            const satrec = twoline2satrec(record.line1, record.line2);
            parsed.push({
              id: record.id,
              name: record.name,
              noradId: record.noradId,
              category: record.category,
              satrec,
            });
            const pv = propagate(satrec, now);
            if (pv && pv.position) {
              const ecf = eciToEcf(pv.position, gmst);
              if (Number.isFinite(ecf.x) && Number.isFinite(ecf.y) && Number.isFinite(ecf.z)) {
                currentPositions.set(record.id, new Cesium.Cartesian3(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000));
              }
            }
            if (!entities.has(record.id)) createEntity(record);
          } catch {
            continue;
          }
        }
        propagated.length = 0;
        propagated.push(...parsed);
        satrecMap.clear();
        for (const sat of propagated) satrecMap.set(sat.id, sat);
        snapshotMap = buildOrbitSnapshots(records);
        setValidCount(propagated.length);
      };

      const initNow = Cesium.JulianDate.toDate(clock.currentTime);
      const initGmst = gstime(initNow);
      for (const record of dataRef.current) {
        try {
          const satrec = twoline2satrec(record.line1, record.line2);
          propagated.push({
            id: record.id,
            name: record.name,
            noradId: record.noradId,
            category: record.category,
            satrec,
          });
          const pv = propagate(satrec, initNow);
          if (pv && pv.position) {
            const ecf = eciToEcf(pv.position, initGmst);
            if (Number.isFinite(ecf.x) && Number.isFinite(ecf.y) && Number.isFinite(ecf.z)) {
              currentPositions.set(record.id, new Cesium.Cartesian3(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000));
            }
          }
        } catch {
          continue;
        }
        createEntity(record);
      }
      satrecMap.clear();
      for (const sat of propagated) satrecMap.set(sat.id, sat);
      snapshotMap = buildOrbitSnapshots(dataRef.current);

      setValidCount(propagated.length);
      setReady(true);

      const updateVisual = (id: string) => {
        const entity = entities.get(id);
        const billboard = entity?.billboard;
        const label = entity?.label;
        if (!entity || !billboard || !label) return;
        const isSelected = id === selectedIdRef.current;
        const isPov = cameraModeRef.current === "pov";
        if (isSelected && isPov) {
          entity.show = false;
          return;
        }
        entity.show = !fullModeActive;
        const isHovered = id === hoveredIdRef;
        const emphasized = isSelected || isHovered;
        const category = categoryById.get(id) ?? "Science";
        const factor = CATEGORY_SCALE[category];
        billboard.scale = new Cesium.ConstantProperty(
          (isSelected ? SPRITE_SELECTED : isHovered ? SPRITE_HOVER : SPRITE_BASE) *
            factor
        );
        billboard.color = new Cesium.ConstantProperty(
          Cesium.Color.WHITE.withAlpha(emphasized ? 1 : CATEGORY_ALPHA[category])
        );
        billboard.image = new Cesium.ConstantProperty(
          emphasized ? satelliteSpriteBright(category) : satelliteSprite(category)
        );
        label.show = new Cesium.ConstantProperty((isSelected && !isPov) || isHovered);
      };

      const resetHovered = (next: string | null) => {
        if (next === hoveredIdRef) return;
        const previous = hoveredIdRef;
        hoveredIdRef = next;
        if (previous) {
          updateVisual(previous);
          updateFullPointVisual(previous, false);
        }
        if (next) {
          updateVisual(next);
          updateFullPointVisual(next, true);
        }
        cesiumViewer.canvas.style.cursor = next ? "pointer" : "default";
      };

      // Live orbital trail on the selected satellite (Selected mode).
      const trailPositions: CesiumNS.Cartesian3[] = [];
      let lastTrailPoint: CesiumNS.Cartesian3 | null = null;
      const trailEntity = cesiumViewer.entities.add({
        id: "trail",
        name: "Orbital trail",
        polyline: {
          positions: new Cesium.CallbackProperty(() => trailPositions, false),
          width: 2,
          material: new Cesium.PolylineGlowMaterialProperty({
            color: Cesium.Color.WHITE.withAlpha(0.6),
            glowPower: 0.12,
          }),
        },
      });

      const resetTrail = () => {
        trailPositions.length = 0;
        lastTrailPoint = null;
      };

      // Statically-sampled orbit path polylines for "All" mode.
      const pathEntities: CesiumNS.Entity[] = [];
      let lastPathRebuildMs = 0;

      const computeOrbitPath = (
        id: string
      ): CesiumNS.Cartesian3[] | null => {
        const sat = satrecMap.get(id);
        if (!sat) return null;
        const revPerDay = Math.max(
          sat.satrec.no * (1440 / (2 * Math.PI)),
          1e-6
        );
        const periodSec = 86400 / revPerDay;
        const t0 = Cesium.JulianDate.toDate(clock.currentTime);
        const points: CesiumNS.Cartesian3[] = [];
        for (let i = 0; i <= ALL_PATH_SAMPLES; i++) {
          const t = new Date(
            t0.getTime() + periodSec * (i / ALL_PATH_SAMPLES) * 1000
          );
          try {
            const pv = propagate(sat.satrec, t);
            if (!pv || !pv.position) continue;
            const gmst = gstime(t);
            const ecf = eciToEcf(pv.position, gmst);
            const { x, y, z } = ecf;
            if (
              !Number.isFinite(x) ||
              !Number.isFinite(y) ||
              !Number.isFinite(z)
            ) {
              continue;
            }
            points.push(new Cesium.Cartesian3(x * 1000, y * 1000, z * 1000));
          } catch {
            continue;
          }
        }
        return points.length >= 3 ? points : null;
      };

      const clearAllPaths = () => {
        for (const entity of pathEntities) {
          cesiumViewer.entities.remove(entity);
        }
        pathEntities.length = 0;
      };

      const rebuildAllPaths = () => {
        clearAllPaths();
        if (orbitModeRef.current !== "all") return;
        const visible = filterSatellites(
          dataRef.current,
          queryRef.current,
          categoryRef.current
        );
        for (const record of visible) {
          const points = computeOrbitPath(record.id);
          if (!points) continue;
          const color = Cesium.Color.fromCssColorString("#e4e4e7").withAlpha(0.22);
          const entity = cesiumViewer.entities.add({
            id: `path-${record.id}`,
            name: `${record.name} orbit`,
            polyline: {
              positions: points,
              width: 1,
              material: new Cesium.ColorMaterialProperty(color),
            },
          });
          pathEntities.push(entity);
        }
      };

      const applyOrbitMode = () => {
        const mode = orbitModeRef.current;
        trailEntity.show = mode === "selected";
        resetTrail();
        if (mode === "all") {
          rebuildAllPaths();
        } else {
          clearAllPaths();
        }
      };

      // 3D model + floating summary label for the selected satellite.
      const modelPos: { current: CesiumNS.Cartesian3 | null } = {
        current: null,
      };
      const metricsRef: { alt: number | null; vel: number | null } = {
        alt: null,
        vel: null,
      };
      let summaryName = "";
      let modelTargetId: string | null = null;

      const modelOrientation = (): CesiumNS.Quaternion | undefined => {
        if (!modelPos.current) return undefined;
        const angle = (performance.now() / 1000) * MODEL_TURN_RAD_PER_S;
        return Cesium.Transforms.headingPitchRollQuaternion(
          modelPos.current,
          new Cesium.HeadingPitchRoll(angle, 0, angle * 0.25)
        );
      };

      const modelEntity = cesiumViewer.entities.add({
        id: "selected-sat-model",
        name: "Selected satellite model",
        position: new Cesium.CallbackPositionProperty(
          () => modelPos.current ?? undefined,
          false
        ),
        orientation: new Cesium.CallbackProperty(() => modelOrientation(), false),
        model: {
          uri: MODEL_URI,
          minimumPixelSize: 56,
          maximumScale: 600_000,
          silhouetteColor: Cesium.Color.fromCssColorString("#fafafa"),
          silhouetteSize: 1.2,
          show: false,
        },
      });

      const summaryText = (): string => {
        const metrics = metricsRef;
        if (metrics.vel == null || metrics.alt == null) return "";
        return `${summaryName}\n${formatAltitude(metrics.alt)} · ${formatVelocity(metrics.vel)}`;
      };

      const summaryEntity = cesiumViewer.entities.add({
        id: "selected-summary",
        name: "Selected satellite summary",
        position: new Cesium.CallbackPositionProperty(
          () => modelPos.current ?? undefined,
          false
        ),
        label: {
          text: new Cesium.CallbackProperty(() => summaryText(), false),
          font: "600 11px sans-serif",
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("rgba(5, 5, 5, 0.85)"),
          backgroundPadding: new Cesium.Cartesian2(10, 6),
          pixelOffset: new Cesium.Cartesian2(0, -58),
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: false,
        },
      });

      // Full Catalog selection flies via this invisible entity so the offset
      // (heading/pitch/range) matches the Explore selection behaviour.
      const fullFlyEntity = cesiumViewer.entities.add({
        id: "full-fly-helper",
        name: "Full catalog selection target",
        show: false,
        position: new Cesium.CallbackPositionProperty(
          () => modelPos.current ?? undefined,
          false
        ),
      });

      // Single hover label shared by every Full Catalog point.
      const fullHoverLabel = cesiumViewer.entities.add({
        id: "full-hover-label",
        name: "Full catalog hover label",
        position: new Cesium.CallbackPositionProperty(
          () => fullHoverPosition.current ?? undefined,
          false
        ),
        label: {
          text: "",
          font: "600 11px sans-serif",
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("rgba(5, 5, 5, 0.85)"),
          backgroundPadding: new Cesium.Cartesian2(8, 5),
          pixelOffset: new Cesium.Cartesian2(0, -20),
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: false,
        },
      });

      const handleSelection = (id: string | null, fly: boolean) => {
        selectedIdRef.current = id;
        modelTargetId = id;
        const isFull = id != null && fullRecords.has(id);
        for (const entityId of entities.keys()) updateVisual(entityId);
        resetTrail();

        // Restore the previously selected Full Catalog point (if any).
        if (selectedFullId) {
          const previous = fullRecords.get(selectedFullId);
          if (previous) previous.point.show = previous.visible;
        }
        selectedFullId = isFull ? id : null;
        if (selectedFullId) {
          const selected = fullRecords.get(selectedFullId);
          if (selected) {
            selected.point.show = false;
            modelPos.current = selected.point.position;
          }
        }

        modelEntity.show = id != null;
        summaryEntity.show = id != null;
        summaryName = isFull
          ? fullRecords.get(id as string)?.record.name ?? ""
          : id
            ? dataRef.current.find((record) => record.id === id)?.name ?? ""
            : "";
        metricsRef.alt = null;
        metricsRef.vel = null;
        if (!fly || !id) return;
        if (isFull) {
          const range = fullRecords.get(id as string)?.flyRangeM ?? 300_000;
          if (!cesiumViewer.isDestroyed()) {
            cesiumViewer.flyTo(fullFlyEntity, {
              duration: 1.5,
              offset: new Cesium.HeadingPitchRange(
                0,
                Cesium.Math.toRadians(-20),
                range
              ),
            });
          }
          return;
        }
        const entity = entities.get(id);
        if (!entity || cesiumViewer.isDestroyed()) return;
        cesiumViewer.selectedEntity = entity;
        const range = snapshotMap.get(id)?.flyRangeM ?? 300_000;
        cesiumViewer.flyTo(entity, {
          duration: 1.5,
          offset: new Cesium.HeadingPitchRange(
            0,
            Cesium.Math.toRadians(-20),
            range
          ),
        });
      };

      onSelectedChangeRef.current = handleSelection;

      const extractSatelliteId = (picked: unknown): string | null => {
        if (!picked) return null;
        const raw = picked as { id?: unknown };
        let candidate: unknown = raw.id ?? picked;
        if (
          typeof candidate === "object" &&
          candidate !== null &&
          candidate instanceof Cesium.Entity
        ) {
          candidate = candidate.id;
        }
        if (typeof candidate === "string" && entities.has(candidate)) {
          return candidate;
        }
        if (typeof candidate === "string" && fullRecords.has(candidate)) {
          return candidate;
        }
        return null;
      };

      const updateFullPointVisual = (id: string, hovering: boolean) => {
        const f = fullRecords.get(id);
        if (!f) return;
        if (hovering) {
          f.point.pixelSize = FULL_POINT_HOVER_PIXEL;
          f.point.color = Cesium.Color.WHITE.withAlpha(FULL_POINT_HOVER_ALPHA);
          fullHoverPosition.current = f.point.position;
          const label = fullHoverLabel.label;
          if (label) {
            label.text = new Cesium.ConstantProperty(f.record.name);
            label.show = new Cesium.ConstantProperty(true);
          }
        } else {
          f.point.pixelSize = FULL_POINT_PIXEL;
          f.point.color = Cesium.Color.WHITE.withAlpha(FULL_POINT_ALPHA);
          fullHoverPosition.current = null;
          const label = fullHoverLabel.label;
          if (label) label.show = new Cesium.ConstantProperty(false);
        }
      };

      const applyFullCatalog = () => {
        fullBuildToken += 1;
        if (fullBuildTimer) {
          window.clearTimeout(fullBuildTimer);
          fullBuildTimer = 0;
        }
        if (fullCollection) {
          scene.primitives.remove(fullCollection);
          fullCollection = null;
        }
        fullRecords.clear();
        fullVisible.length = 0;
        selectedFullId = null;
        fullSliceIndex = 0;
        modelPos.current = null;
        modelEntity.show = false;
        summaryEntity.show = false;

        const records = fullCatalogRef.current;
        if (records.length === 0) return;

        fullCollection = new Cesium.PointPrimitiveCollection();
        scene.primitives.add(fullCollection);
        const now = Cesium.JulianDate.toDate(clock.currentTime);
        const toggles = useSatelliteStore.getState();
        const token = fullBuildToken;
        let index = 0;

        const buildChunk = () => {
          if (token !== fullBuildToken || !fullCollection) return;
          const end = Math.min(index + FULL_BUILD_CHUNK, records.length);
          for (; index < end; index += 1) {
            const record = records[index];
            try {
              const satrec = twoline2satrec(record.line1, record.line2);
              const pv = propagate(satrec, now);
              if (!pv || !pv.position) continue;
              const velocity = pv.velocity;
              const on =
                record.objectType === "active"
                  ? toggles.showActive
                  : record.objectType === "rocketBody"
                    ? toggles.showRocketBodies
                    : toggles.showDebris;
              let flyRangeM = 300_000;
              try {
                flyRangeM = parseOrbit(record).flyRangeM;
              } catch {
                // Keep the default range for unparseable records.
              }
              const gmst = gstime(now);
              const ecf = eciToEcf(pv.position, gmst);
              const initialPos = new Cesium.Cartesian3(
                ecf.x * 1000,
                ecf.y * 1000,
                ecf.z * 1000
              );
              const point = fullCollection.add({
                position: initialPos,
                pixelSize: FULL_POINT_PIXEL,
                color: Cesium.Color.WHITE.withAlpha(FULL_POINT_ALPHA),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                id: record.id,
                show: on,
              });
              fullRecords.set(record.id, {
                record,
                satrec,
                point,
                eci: {
                  x: pv.position.x,
                  y: pv.position.y,
                  z: pv.position.z,
                  vx: velocity?.x ?? 0,
                  vy: velocity?.y ?? 0,
                  vz: velocity?.z ?? 0,
                },
                simMs: now.getTime(),
                visible: on,
                flyRangeM,
              });
            } catch {
              continue;
            }
          }
          if (index < records.length) {
            fullBuildTimer = window.setTimeout(buildChunk, 0);
          } else {
            fullModeActive = catalogModeRef.current === "full";
            applyFullVisibility();
          }
        };

        buildChunk();
      };

      const applyFullVisibility = () => {
        const toggles = useSatelliteStore.getState();
        fullVisible.length = 0;
        for (const f of fullRecords.values()) {
          const on =
            f.record.objectType === "active"
              ? toggles.showActive
              : f.record.objectType === "rocketBody"
                ? toggles.showRocketBodies
                : toggles.showDebris;
          f.visible = on;
          if (on) {
            fullVisible.push(f);
            f.point.show = f.record.id !== selectedFullId;
          } else {
            f.point.show = false;
          }
        }
        const selected = selectedFullId ? fullRecords.get(selectedFullId) : null;
        if (selected && !selected.visible) {
          useSatelliteStore.getState().setSelectedId(null);
        }
      };

      const applyCatalogMode = () => {
        const isFull = catalogModeRef.current === "full";
        fullModeActive = isFull;
        for (const entity of entities.values()) entity.show = !isFull;
        if (fullCollection) fullCollection.show = isFull;
        if (isFull) {
          resetHovered(null);
          clearAllPaths();
          trailEntity.show = false;
        }
        handleSelection(selectedIdRef.current, false);
      };

      screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);

      screenSpaceHandler.setInputAction(
        (movement: CesiumNS.ScreenSpaceEventHandler.MotionEvent) => {
          const id = extractSatelliteId(scene.pick(movement.endPosition));
          resetHovered(id);
        },
        Cesium.ScreenSpaceEventType.MOUSE_MOVE
      );

      screenSpaceHandler.setInputAction(
        (movement: CesiumNS.ScreenSpaceEventHandler.PositionedEvent) => {
          const id = extractSatelliteId(scene.pick(movement.position));
          setSelectedId(id);
        },
        Cesium.ScreenSpaceEventType.LEFT_CLICK
      );

      let lastFlushMs = 0;

      const handleTick = (tickClock: CesiumNS.Clock) => {
        const date = Cesium.JulianDate.toDate(tickClock.currentTime);
        const nowMs = performance.now();
        let selectedVel: number | null = null;
        let selectedAlt: number | null = null;
        let selectedPos: CesiumNS.Cartesian3 | undefined;

        for (const sat of propagated) {
          try {
            const pv = propagate(sat.satrec, date);
            if (!pv || !pv.position) continue;
            const gmst = gstime(date);
            const ecf = eciToEcf(pv.position, gmst);
            const { x, y, z } = ecf;
            if (
              !Number.isFinite(x) ||
              !Number.isFinite(y) ||
              !Number.isFinite(z)
            ) {
              continue;
            }
            const pos = new Cesium.Cartesian3(x * 1000, y * 1000, z * 1000);
            currentPositions.set(sat.id, pos);
            if (sat.id === selectedIdRef.current) {
              if (pv.velocity && Number.isFinite(pv.velocity.x)) {
                selectedVel = Math.sqrt(
                  pv.velocity.x ** 2 + pv.velocity.y ** 2 + pv.velocity.z ** 2
                );
              }
              selectedAlt = Math.hypot(x, y, z) - EARTH_RADIUS_KM;
              selectedPos = pos;
              metricsRef.alt = selectedAlt;
              metricsRef.vel = selectedVel;
            }
          } catch {
            continue;
          }
        }

        // Full Catalog: rolling SGP4 slice + cheap linear extrapolation for
        // thousands of batched points, exact SGP4 for the selected object.
        if (
          fullModeActive &&
          fullCollection &&
          fullVisible.length > 0
        ) {
          const gmst = gstime(date);
          const cosG = Math.cos(gmst);
          const sinG = Math.sin(gmst);
          const dateMs = date.getTime();
          const list = fullVisible;

          const start = fullSliceIndex;
          fullSliceIndex = (fullSliceIndex + 1) % FULL_SLICE_FRAMES;
          for (let i = start; i < list.length; i += FULL_SLICE_FRAMES) {
            const f = list[i];
            try {
              const pv = propagate(f.satrec, date);
              if (!pv || !pv.position) continue;
              const velocity = pv.velocity;
              f.eci.x = pv.position.x;
              f.eci.y = pv.position.y;
              f.eci.z = pv.position.z;
              f.eci.vx = velocity?.x ?? 0;
              f.eci.vy = velocity?.y ?? 0;
              f.eci.vz = velocity?.z ?? 0;
              f.simMs = dateMs;
            } catch {
              continue;
            }
          }

          for (let i = 0; i < list.length; i++) {
            const f = list[i];
            const dt = (dateMs - f.simMs) / 1000;
            const ex = f.eci.x + f.eci.vx * dt;
            const ey = f.eci.y + f.eci.vy * dt;
            const ez = f.eci.z + f.eci.vz * dt;
            f.point.position = new Cesium.Cartesian3(
              (ex * cosG + ey * sinG) * 1000,
              (-ex * sinG + ey * cosG) * 1000,
              ez * 1000
            );
          }

          if (selectedFullId) {
            const selected = fullRecords.get(selectedFullId);
            if (selected) {
              try {
                const pv = propagate(selected.satrec, date);
                if (pv && pv.position) {
                  const { x, y, z } = pv.position;
                  const ecfX = x * cosG + y * sinG;
                  const ecfY = -x * sinG + y * cosG;
                  const pos = new Cesium.Cartesian3(
                    ecfX * 1000,
                    ecfY * 1000,
                    z * 1000
                  );
                  selected.point.position = pos;
                  modelPos.current = pos;
                  if (pv.velocity && Number.isFinite(pv.velocity.x)) {
                    selectedVel = Math.sqrt(
                      pv.velocity.x ** 2 +
                        pv.velocity.y ** 2 +
                        pv.velocity.z ** 2
                    );
                  }
                  selectedAlt = Math.hypot(ecfX, ecfY, z) - EARTH_RADIUS_KM;
                  selectedPos = pos;
                  metricsRef.alt = selectedAlt;
                  metricsRef.vel = selectedVel;
                }
              } catch {
                // Keep the last known position.
              }
            }
          }

          if (hoveredIdRef && fullRecords.has(hoveredIdRef)) {
            const hovered = fullRecords.get(hoveredIdRef);
            if (hovered) fullHoverPosition.current = hovered.point.position;
          }
        }

        const isPov = cameraModeRef.current === "pov";
        const targetId = modelTargetId;
        if (selectedFullId) {
          const selected = fullRecords.get(selectedFullId);
          modelPos.current = selected ? selected.point.position : null;
        } else if (targetId && currentPositions.has(targetId)) {
          modelPos.current = currentPositions.get(targetId) ?? null;
        } else {
          modelPos.current = null;
        }

        // Toggle 3D model & summary overlay visibility (hidden during first-person Cockpit POV)
        modelEntity.show = !isPov && (selectedIdRef.current != null || selectedFullId != null);
        summaryEntity.show = !isPov && (selectedIdRef.current != null || selectedFullId != null);

        // Satellite First-Person Cockpit POV Camera Tracking
        if (isPov && !cesiumViewer.isDestroyed()) {
          let selSatrec: PropagatedSat["satrec"] | null = null;
          if (selectedIdRef.current && satrecMap.has(selectedIdRef.current)) {
            selSatrec = satrecMap.get(selectedIdRef.current)!.satrec;
          } else if (selectedFullId && fullRecords.has(selectedFullId)) {
            selSatrec = fullRecords.get(selectedFullId)!.satrec;
          }

          if (selSatrec) {
            try {
              const date0 = date;
              const date1 = new Date(date.getTime() + 1000);
              const pv0 = propagate(selSatrec, date0);
              const pv1 = propagate(selSatrec, date1);
              if (pv0 && pv0.position && pv1 && pv1.position) {
                const gmst0 = gstime(date0);
                const gmst1 = gstime(date1);
                const ecf0 = eciToEcf(pv0.position, gmst0);
                const ecf1 = eciToEcf(pv1.position, gmst1);

                const pos0 = new Cesium.Cartesian3(
                  ecf0.x * 1000,
                  ecf0.y * 1000,
                  ecf0.z * 1000
                );
                const pos1 = new Cesium.Cartesian3(
                  ecf1.x * 1000,
                  ecf1.y * 1000,
                  ecf1.z * 1000
                );

                // Zenith normal vector (up from Earth center)
                const upZenith = Cesium.Cartesian3.normalize(
                  pos0,
                  new Cesium.Cartesian3()
                );

                // Forward flight velocity vector across Earth surface
                const fwdRaw = Cesium.Cartesian3.subtract(
                  pos1,
                  pos0,
                  new Cesium.Cartesian3()
                );
                const forward = Cesium.Cartesian3.normalize(
                  fwdRaw,
                  new Cesium.Cartesian3()
                );

                // Tangent horizontal flight vector along orbital path
                const dot = Cesium.Cartesian3.dot(forward, upZenith);
                const horiz = Cesium.Cartesian3.subtract(
                  forward,
                  Cesium.Cartesian3.multiplyByScalar(
                    upZenith,
                    dot,
                    new Cesium.Cartesian3()
                  ),
                  new Cesium.Cartesian3()
                );
                Cesium.Cartesian3.normalize(horiz, horiz);

                // Pitch angle: 30 degrees downward toward Earth's surface
                const pitch = Cesium.Math.toRadians(30);
                const cosP = Math.cos(pitch);
                const sinP = Math.sin(pitch);

                const lookDir = Cesium.Cartesian3.subtract(
                  Cesium.Cartesian3.multiplyByScalar(
                    horiz,
                    cosP,
                    new Cesium.Cartesian3()
                  ),
                  Cesium.Cartesian3.multiplyByScalar(
                    upZenith,
                    sinP,
                    new Cesium.Cartesian3()
                  ),
                  new Cesium.Cartesian3()
                );
                Cesium.Cartesian3.normalize(lookDir, lookDir);

                const upDir = Cesium.Cartesian3.add(
                  Cesium.Cartesian3.multiplyByScalar(
                    horiz,
                    sinP,
                    new Cesium.Cartesian3()
                  ),
                  Cesium.Cartesian3.multiplyByScalar(
                    upZenith,
                    cosP,
                    new Cesium.Cartesian3()
                  ),
                  new Cesium.Cartesian3()
                );
                Cesium.Cartesian3.normalize(upDir, upDir);

                // Eye position: 60m above, 150m behind the satellite along orbital direction
                const eyePos = Cesium.Cartesian3.add(
                  pos0,
                  Cesium.Cartesian3.multiplyByScalar(
                    upZenith,
                    60,
                    new Cesium.Cartesian3()
                  ),
                  new Cesium.Cartesian3()
                );
                Cesium.Cartesian3.subtract(
                  eyePos,
                  Cesium.Cartesian3.multiplyByScalar(
                    horiz,
                    150,
                    new Cesium.Cartesian3()
                  ),
                  eyePos
                );

                cesiumViewer.camera.cancelFlight();
                cesiumViewer.camera.setView({
                  destination: eyePos,
                  orientation: {
                    direction: lookDir,
                    up: upDir,
                  },
                });
              }
            } catch {
              // Ignore calculation errors
            }
          }
        }

        if (!selectedFullId && orbitModeRef.current === "selected") {
          if (selectedIdRef.current && selectedPos) {
            if (!lastTrailPoint) {
              trailPositions.push(selectedPos);
            } else {
              const dx = selectedPos.x - lastTrailPoint.x;
              const dy = selectedPos.y - lastTrailPoint.y;
              const dz = selectedPos.z - lastTrailPoint.z;
              if (
                dx * dx + dy * dy + dz * dz >
                TRAIL_MIN_STEP_M * TRAIL_MIN_STEP_M
              ) {
                trailPositions.push(selectedPos);
              }
            }
            if (trailPositions.length > TRAIL_MAX_POINTS) {
              trailPositions.splice(0, trailPositions.length - TRAIL_MAX_POINTS);
            }
          } else {
            resetTrail();
          }
          lastTrailPoint = selectedPos ?? null;
        } else {
          resetTrail();
          lastTrailPoint = null;
        }

        if (
          !fullModeActive &&
          orbitModeRef.current === "all" &&
          nowMs - lastPathRebuildMs >= ALL_PATH_REBUILD_MS
        ) {
          lastPathRebuildMs = nowMs;
          rebuildAllPaths();
        }

        if (nowMs - lastFlushMs >= METRICS_FLUSH_MS) {
          lastFlushMs = nowMs;
          const hasSelection = selectedIdRef.current != null;
          setLiveMetrics({
            simTimeMs: date.getTime(),
            velocityKmS: hasSelection ? selectedVel : null,
            altitudeKm: hasSelection ? (selectedAlt ?? null) : null,
          });
        }
      };

      const applyCameraMode = () => {
        const isPov = cameraModeRef.current === "pov";
        if (cesiumViewer && !cesiumViewer.isDestroyed()) {
          cesiumViewer.camera.cancelFlight();
          cesiumViewer.selectedEntity = undefined;
          cesiumViewer.trackedEntity = undefined;
          const controller = cesiumViewer.scene.screenSpaceCameraController;
          controller.enableRotate = !isPov;
          controller.enableTranslate = !isPov;
          controller.enableZoom = !isPov;
          controller.enableTilt = !isPov;
          controller.enableLook = !isPov;
        }
        for (const entityId of entities.keys()) updateVisual(entityId);
      };

      const resetView = () => {
        if (!cesiumViewer || cesiumViewer.isDestroyed()) return;
        cesiumViewer.camera.cancelFlight();
        cesiumViewer.selectedEntity = undefined;
        cesiumViewer.trackedEntity = undefined;
        const controller = cesiumViewer.scene.screenSpaceCameraController;
        controller.enableRotate = true;
        controller.enableTranslate = true;
        controller.enableZoom = true;
        controller.enableTilt = true;
        controller.enableLook = true;
        for (const entityId of entities.keys()) updateVisual(entityId);
        cesiumViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(15, 15, 23_500_000),
          duration: 1.5,
        });
      };

      removeTickListener = clock.onTick.addEventListener(handleTick);

      handleSelection(selectedIdRef.current, false);

      apiRef.current = {
        applyDataset: (records: SatelliteRecord[]) => {
          dataRef.current = records;
          rebuildPropagated(records);
          applyOrbitMode();
        },
        applyOrbitMode,
        applyOverlay: (
          kind: "earth" | "borders" | "grid" | "cities",
          on: boolean
        ) => {
          const layer =
            kind === "earth"
              ? earth
              : kind === "borders"
                ? borders
                : kind === "grid"
                  ? grid
                  : cities;
          layer.show = on;
        },
        applyCatalogMode,
        applyFullCatalog,
        applyFullVisibility,
        applyCameraMode,
        resetView,
      };

      handleTick(clock);
    } catch (err) {
      console.error("Cesium initialization error:", err);
    }
  }

    init();

    return () => {
      isCancelled = true;
      onSelectedChangeRef.current = null;
      apiRef.current = null;
      if (starRaf) cancelAnimationFrame(starRaf);
      if (fullBuildTimer) {
        window.clearTimeout(fullBuildTimer);
        fullBuildTimer = 0;
        fullBuildToken += 1;
      }
      removeTickListener?.();
      removeCameraChanged?.();
      if (screenSpaceHandler && !screenSpaceHandler.isDestroyed()) {
        screenSpaceHandler.destroy();
      }
      setReady(false);
      setValidCount(0);
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, [setSelectedId, setReady, setValidCount, setLiveMetrics]);

  return <div ref={containerRef} className="h-full w-full" />;
}