import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";

(() => {
    "use strict";

    const root = document.getElementById("customizer");
    const stage = document.getElementById("designer-3d-stage");
    const canvas = document.getElementById("designer-3d-canvas");
    const loading = document.getElementById("designer-3d-loading");
    if (!root || !stage || !canvas) return;

    const data = JSON.parse(document.getElementById("designer-data")?.textContent || "{}");
    const modelView = (data.views || []).find((view) => view.model) || null;
    if (!modelView) return;

    const artworks = data.artworks || [];
    const artworkById = (id) => artworks.find((item) => Number(item.id) === Number(id));
    const layers = new Map();
    const textureCache = new Map();
    const modelMeshes = [];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const modelBounds = new THREE.Box3();
    const modelCenter = new THREE.Vector3();
    const modelSize = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);

    let scene;
    let camera;
    let renderer;
    let controls;
    let modelRoot;
    let selectedLayerId = null;
    let activeAreaId = null;
    let nextLayerId = 1;
    let dragState = null;
    let active = true;
    let frameRequested = false;

    function setStatus(text) {
        const status = document.getElementById("save-status");
        if (status) status.textContent = text;
    }

    function getCookie(name) {
        for (const cookie of (document.cookie || "").split(";")) {
            const [key, ...value] = cookie.trim().split("=");
            if (key === name) return decodeURIComponent(value.join("="));
        }
        return "";
    }

    function requestRender() {
        if (frameRequested) return;
        frameRequested = true;
        requestAnimationFrame(() => {
            frameRequested = false;
            if (renderer && scene && camera) renderer.render(scene, camera);
        });
    }

    function resizeRenderer() {
        if (!renderer || !camera) return;
        const width = Math.max(1, stage.clientWidth);
        const height = Math.max(1, stage.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        requestRender();
    }

    function loadTexture(url) {
        if (textureCache.has(url)) return textureCache.get(url);
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        const promise = loader.loadAsync(url).then((texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = renderer?.capabilities.getMaxAnisotropy?.() || 1;
            return texture;
        });
        textureCache.set(url, promise);
        return promise;
    }

    function normalizeModel(object) {
        modelBounds.setFromObject(object);
        modelBounds.getCenter(modelCenter);
        modelBounds.getSize(modelSize);
        const maxDimension = Math.max(modelSize.x, modelSize.y, modelSize.z) || 1;
        const scale = (3.2 / maxDimension) * Number(modelView.model_scale || 1);
        object.scale.multiplyScalar(scale);
        object.updateMatrixWorld(true);
        modelBounds.setFromObject(object);
        modelBounds.getCenter(modelCenter);
        modelBounds.getSize(modelSize);
        object.position.sub(modelCenter);
        object.position.y -= 0.05;
        object.updateMatrixWorld(true);
        modelBounds.setFromObject(object);
        modelBounds.getSize(modelSize);
    }

    function setupModel(object) {
        object.traverse((mesh) => {
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            modelMeshes.push(mesh);
            if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((material) => material.clone());
            else if (mesh.material) mesh.material = mesh.material.clone();
        });
    }

    function eventPointer(event) {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function garmentHits(event, includeDecals = false) {
        eventPointer(event);
        raycaster.setFromCamera(pointer, camera);
        const targets = includeDecals
            ? [modelRoot, ...Array.from(layers.values()).map((item) => item.mesh).filter(Boolean)]
            : modelMeshes;
        return raycaster.intersectObjects(targets, true);
    }

    function hitNormal(hit) {
        const normal = hit.face?.normal?.clone() || hit.normal?.clone() || new THREE.Vector3(0, 0, 1);
        return normal.transformDirection(hit.object.matrixWorld).normalize();
    }

    function orientationFor(normal, rotation) {
        const n = normal.clone().normalize();
        const align = new THREE.Quaternion().setFromUnitVectors(zAxis, n);
        const spin = new THREE.Quaternion().setFromAxisAngle(n, THREE.MathUtils.degToRad(rotation || 0));
        return new THREE.Euler().setFromQuaternion(spin.multiply(align));
    }

    function decalSize(layer, texture) {
        const aspect = Math.max(0.1, (texture.image?.width || 1) / Math.max(1, texture.image?.height || 1));
        const width = Math.max(0.04, modelSize.x * 0.22 * Number(layer.width || 0.35) / 0.35);
        return new THREE.Vector3(width, width / aspect, Math.max(0.008, width * 0.035));
    }

    function materialFor(texture, selected) {
        return new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.02,
            roughness: 0.72,
            metalness: 0,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            emissive: new THREE.Color(selected ? 0x211c10 : 0x000000),
            emissiveIntensity: selected ? 0.28 : 0,
            side: THREE.DoubleSide,
        });
    }

    function disposeDecal(item) {
        if (!item?.mesh) return;
        item.mesh.geometry?.dispose();
        item.mesh.material?.dispose();
        scene.remove(item.mesh);
        item.mesh = null;
    }

    function project(item, point, normal) {
        loadTexture(item.artwork.image).then((texture) => {
            if (!layers.has(item.id)) return;
            disposeDecal(item);
            item.position = point.clone();
            item.normal = normal.clone().normalize();
            item.size = decalSize(item.layer, texture);
            const target = item.targetMesh || modelMeshes[0];
            if (!target) return;
            const geometry = new DecalGeometry(target, item.position, orientationFor(item.normal, item.layer.rotation), item.size);
            const mesh = new THREE.Mesh(geometry, materialFor(texture, item.id === selectedLayerId));
            mesh.renderOrder = 20 + Number(item.layer.z_index || 0);
            mesh.userData.customizerLayerId = item.id;
            scene.add(mesh);
            item.mesh = mesh;
            requestRender();
        }).catch(() => setStatus("تصویر لیبل برای پیش‌نمایش سه‌بعدی بارگذاری نشد."));
    }

    function centerHit() {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        return raycaster.intersectObjects(modelMeshes, false)[0] || null;
    }

    function addLayer(artworkId) {
        const artwork = artworkById(artworkId);
        const hit = centerHit();
        if (!artwork || !hit) return;
        const index = layers.size;
        const layer = {
            id: nextLayerId++,
            artwork_id: artwork.id,
            area_id: activeAreaId || modelView.areas?.[0]?.id || null,
            x: [0.5, 0.28, 0.72, 0.5][index % 4],
            y: [0.48, 0.48, 0.48, 0.68][index % 4],
            width: 0.35,
            height: 0.25,
            rotation: 0,
            z_index: index,
        };
        const item = { id: layer.id, layer, artwork, targetMesh: hit.object, position: hit.point.clone(), normal: hitNormal(hit), mesh: null };
        layers.set(item.id, item);
        selectedLayerId = item.id;
        project(item, item.position, item.normal);
    }

    function selectLayer(id) {
        selectedLayerId = id == null ? null : Number(id);
        layers.forEach((item) => {
            if (!item.mesh?.material) return;
            const selected = item.id === selectedLayerId;
            item.mesh.material.emissive?.setHex(selected ? 0x211c10 : 0x000000);
            item.mesh.material.emissiveIntensity = selected ? 0.28 : 0;
        });
        requestRender();
    }

    function moveSelected(event) {
        const item = layers.get(selectedLayerId);
        if (!item) return false;
        const hit = garmentHits(event)[0];
        if (!hit) return false;
        item.targetMesh = hit.object;
        project(item, hit.point, hitNormal(hit));
        return true;
    }

    function savePayload() {
        return Array.from(layers.values()).map((item) => ({
            ...item.layer,
            three_d: {
                position: item.position?.toArray().map((value) => Number(value.toFixed(6))) || null,
                normal: item.normal?.toArray().map((value) => Number(value.toFixed(6))) || null,
                mesh: item.targetMesh?.name || null,
                size: item.size?.toArray().map((value) => Number(value.toFixed(6))) || null,
                mode: "surface_decal",
            },
        }));
    }

    function bindInteraction() {
        canvas.addEventListener("pointerdown", (event) => {
            const hits = garmentHits(event, true);
            const decal = hits.find((hit) => hit.object?.userData?.customizerLayerId != null);
            if (decal) {
                selectLayer(decal.object.userData.customizerLayerId);
                dragState = { pointerId: event.pointerId };
                controls.enabled = false;
                canvas.setPointerCapture(event.pointerId);
                return;
            }
            if (selectedLayerId != null && moveSelected(event)) {
                dragState = { pointerId: event.pointerId };
                controls.enabled = false;
                canvas.setPointerCapture(event.pointerId);
            }
        });

        canvas.addEventListener("pointermove", (event) => {
            if (dragState?.pointerId === event.pointerId) moveSelected(event);
        });

        ["pointerup", "pointercancel"].forEach((type) => canvas.addEventListener(type, (event) => {
            if (dragState?.pointerId !== event.pointerId) return;
            dragState = null;
            controls.enabled = true;
            canvas.releasePointerCapture?.(event.pointerId);
        }));

        document.getElementById("artwork-grid")?.addEventListener("click", (event) => {
            const card = event.target.closest(".artwork-card");
            if (card) window.setTimeout(() => addLayer(Number(card.dataset.artworkId)), 0);
        });

        document.getElementById("area-list")?.addEventListener("click", (event) => {
            const button = event.target.closest(".area-option");
            if (button) activeAreaId = Number(button.dataset.areaId);
        });

        document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
            const item = layers.get(selectedLayerId);
            if (!item) return;
            const action = button.dataset.action;
            if (action === "scale-up" || action === "scale-down") {
                const factor = action === "scale-up" ? 1.06 : 0.94;
                item.layer.width = Math.min(1, Math.max(0.02, item.layer.width * factor));
                item.layer.height = Math.min(1, Math.max(0.02, item.layer.height * factor));
                project(item, item.position, item.normal);
            } else if (action === "rotate-left" || action === "rotate-right") {
                item.layer.rotation = Math.max(-180, Math.min(180, item.layer.rotation + (action === "rotate-left" ? -5 : 5)));
                project(item, item.position, item.normal);
            } else if (action === "delete") {
                disposeDecal(item);
                layers.delete(selectedLayerId);
                selectedLayerId = null;
            }
            requestRender();
        }));

        document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

        document.getElementById("save-design")?.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const button = event.currentTarget;
            const status = document.getElementById("save-status");
            button.disabled = true;
            if (status) status.textContent = "در حال بررسی و ذخیره طراحی سه‌بعدی…";
            try {
                const response = await fetch(root.dataset.saveUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        variant_id: document.getElementById("variant-select")?.value || null,
                        version: 2,
                        preview_mode: "3d_surface_decal",
                        layers: savePayload(),
                    }),
                });
                const result = await response.json();
                if (!response.ok || !result.ok) throw new Error(result.error || "ذخیره طراحی انجام نشد.");
                if (status) status.textContent = `طراحی سه‌بعدی ذخیره شد · کد ${result.draft_id.slice(0, 8)}`;
            } catch (error) {
                if (status) status.textContent = error.message || "ذخیره طراحی انجام نشد.";
            } finally {
                button.disabled = false;
            }
        }, { capture: true });
    }

    function setMode(mode) {
        const is3d = mode === "3d";
        document.getElementById("designer-2d-stage")?.classList.toggle("is-hidden", is3d);
        document.getElementById("designer-3d-stage")?.classList.toggle("is-hidden", !is3d);
        document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
        active = is3d;
        if (is3d) resizeRenderer();
    }

    function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf4f2ee);
        camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
        camera.position.set(0, 0.15, 5.2);
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.055;
        controls.enablePan = false;
        controls.minDistance = 2.6;
        controls.maxDistance = 8;
        controls.minPolarAngle = 0.9;
        controls.maxPolarAngle = 2.25;
        controls.target.set(0, 0.05, 0);
        controls.addEventListener("change", requestRender);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8b82, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 3.2);
        key.position.set(3.5, 4.5, 5);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xcfd8ff, 1.3);
        fill.position.set(-4, 2, -3);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffe4c4, 1.0);
        rim.position.set(2, 1, -4);
        scene.add(rim);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(4.5, 64), new THREE.MeshStandardMaterial({ color: 0xe9e5de, roughness: 0.95, metalness: 0 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.75;
        floor.receiveShadow = true;
        scene.add(floor);
        resizeRenderer();
    }

    async function loadModel() {
        loading.textContent = "در حال بارگذاری لباس سه‌بعدی…";
        try {
            const gltf = await new GLTFLoader().loadAsync(modelView.model);
            modelRoot = gltf.scene;
            normalizeModel(modelRoot);
            setupModel(modelRoot);
            scene.add(modelRoot);
            loading.classList.add("is-hidden");
            requestRender();
        } catch (error) {
            console.error("Customizer 3D model load failed", error);
            loading.textContent = "مدل سه‌بعدی بارگذاری نشد؛ نمای چاپ در دسترس است.";
            document.getElementById("designer-3d-stage")?.classList.add("is-hidden");
            document.getElementById("designer-2d-stage")?.classList.remove("is-hidden");
            document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === "2d"));
            active = false;
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        if (!active) return;
        controls?.update();
        renderer?.render(scene, camera);
    }

    window.BabaeiCustomizer3D = { getPayload: savePayload, isReady: () => Boolean(modelRoot && renderer), setMode };

    initScene();
    bindInteraction();
    loadModel();
    animate();
    window.addEventListener("resize", resizeRenderer);
})();
