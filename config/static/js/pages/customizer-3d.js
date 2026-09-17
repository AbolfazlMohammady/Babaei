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
    let dragState = null;
    let active = true;
    let frameRequested = false;

    function setStatus(text) {
        const status = document.getElementById("save-status");
        if (status) status.textContent = text;
    }

    function resizeRenderer() {
        if (!renderer || !camera) return;
        const width = Math.max(1, stage.clientWidth);
        const height = Math.max(1, stage.clientHeight);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        requestRender();
    }

    function requestRender() {
        if (frameRequested) return;
        frameRequested = true;
        requestAnimationFrame(() => {
            frameRequested = false;
            if (renderer && scene && camera) renderer.render(scene, camera);
        });
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

    function normalizeModel(rootObject) {
        modelBounds.setFromObject(rootObject);
        modelBounds.getCenter(modelCenter);
        modelBounds.getSize(modelSize);
        const maxDimension = Math.max(modelSize.x, modelSize.y, modelSize.z) || 1;
        const desiredHeight = 3.2;
        const scale = (desiredHeight / maxDimension) * Number(modelView.model_scale || 1);
        rootObject.scale.multiplyScalar(scale);
        rootObject.updateMatrixWorld(true);
        modelBounds.setFromObject(rootObject);
        modelBounds.getCenter(modelCenter);
        rootObject.position.sub(modelCenter);
        rootObject.position.y -= 0.05;
        rootObject.updateMatrixWorld(true);
    }

    function setupModelMaterials(rootObject) {
        rootObject.traverse((object) => {
            if (!object.isMesh) return;
            object.castShadow = true;
            object.receiveShadow = true;
            modelMeshes.push(object);
            if (Array.isArray(object.material)) {
                object.material = object.material.map((material) => material.clone());
            } else if (object.material) {
                object.material = object.material.clone();
            }
        });
    }

    function pointerPosition(event) {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function garmentHits(event, includeDecals = false) {
        pointerPosition(event);
        raycaster.setFromCamera(pointer, camera);
        const targets = includeDecals ? [modelRoot, ...Array.from(layers.values()).map((item) => item.mesh)] : modelMeshes;
        return raycaster.intersectObjects(targets, true);
    }

    function normalFromIntersection(hit) {
        const normal = hit.face?.normal?.clone() || hit.normal?.clone();
        if (!normal) return new THREE.Vector3(0, 0, 1);
        return normal.transformDirection(hit.object.matrixWorld).normalize();
    }

    function decalOrientation(normal, rotationDegrees) {
        const align = new THREE.Quaternion().setFromUnitVectors(zAxis, normal.clone().normalize());
        const spin = new THREE.Quaternion().setFromAxisAngle(normal.clone().normalize(), THREE.MathUtils.degToRad(rotationDegrees || 0));
        return new THREE.Euler().setFromQuaternion(spin.multiply(align));
    }

    function layerSize(layer, texture) {
        const aspect = Math.max(0.1, (texture.image?.width || 1) / Math.max(1, texture.image?.height || 1));
        const width = Math.max(0.04, modelSize.x * 0.18 * Number(layer.width || 0.45) / 0.45);
        const height = width / aspect;
        return new THREE.Vector3(width, height, Math.max(0.008, width * 0.04));
    }

    function makeDecalMaterial(texture, selected) {
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
            emissive: selected ? new THREE.Color(0x211c10) : new THREE.Color(0x000000),
            emissiveIntensity: selected ? 0.28 : 0,
            side: THREE.DoubleSide,
        });
    }

    function disposeDecal(item) {
        if (!item?.mesh) return;
        item.mesh.geometry?.dispose();
        if (item.mesh.material) item.mesh.material.dispose();
        scene.remove(item.mesh);
    }

    function rebuildDecal(item, hitPoint, hitNormal) {
        if (!item || !item.artwork) return;
        const texturePromise = loadTexture(item.artwork.image);
        texturePromise.then((texture) => {
            if (!layers.has(item.id) || !modelRoot) return;
            if (item.mesh) disposeDecal(item);
            item.position = hitPoint.clone();
            item.normal = hitNormal.clone().normalize();
            item.size = layerSize(item.layer, texture);
            const target = item.targetMesh || modelMeshes[0];
            if (!target) return;
            const orientation = decalOrientation(item.normal, item.layer.rotation);
            const geometry = new DecalGeometry(target, item.position, orientation, item.size);
            const mesh = new THREE.Mesh(geometry, makeDecalMaterial(texture, item.id === selectedLayerId));
            mesh.renderOrder = 20 + Number(item.layer.z_index || 0);
            mesh.userData.customizerLayerId = item.id;
            scene.add(mesh);
            item.mesh = mesh;
            requestRender();
        }).catch(() => setStatus("تصویر لیبل برای پیش‌نمایش سه‌بعدی بارگذاری نشد."));
    }

    function findInitialHit() {
        if (!modelRoot) return null;
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hits = raycaster.intersectObjects(modelMeshes, false);
        return hits[0] || null;
    }

    function addLayer(layer) {
        const artwork = artworkById(layer.artwork_id);
        if (!artwork) return;
        const hit = findInitialHit();
        if (!hit) {
            setStatus("سطح لباس برای قرار دادن لیبل پیدا نشد.");
            return;
        }
        const item = {
            id: layer.id,
            layer: { ...layer },
            artwork,
            targetMesh: hit.object,
            position: hit.point.clone(),
            normal: normalFromIntersection(hit),
            mesh: null,
        };
        layers.set(item.id, item);
        selectedLayerId = item.id;
        rebuildDecal(item, item.position, item.normal);
        requestRender();
    }

    function updateSelectionVisuals() {
        layers.forEach((item) => {
            if (!item.mesh?.material) return;
            item.mesh.material.emissive?.setHex(item.id === selectedLayerId ? 0x211c10 : 0x000000);
            if (item.mesh.material.emissiveIntensity !== undefined) item.mesh.material.emissiveIntensity = item.id === selectedLayerId ? 0.28 : 0;
        });
        requestRender();
    }

    function selectLayer(id) {
        selectedLayerId = id == null ? null : Number(id);
        updateSelectionVisuals();
    }

    function moveSelected(event) {
        const selected = layers.get(selectedLayerId);
        if (!selected) return false;
        const hits = garmentHits(event);
        if (!hits.length) return false;
        const hit = hits[0];
        selected.targetMesh = hit.object;
        rebuildDecal(selected, hit.point, normalFromIntersection(hit));
        return true;
    }

    function handlePointerDown(event) {
        const hits = garmentHits(event, true);
        const decalHit = hits.find((hit) => hit.object?.userData?.customizerLayerId != null);
        if (decalHit) {
            selectLayer(decalHit.object.userData.customizerLayerId);
            dragState = { pointerId: event.pointerId, moving: true };
            controls.enabled = false;
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (selectedLayerId != null && hits.some((hit) => modelMeshes.includes(hit.object))) {
            if (moveSelected(event)) {
                dragState = { pointerId: event.pointerId, moving: true };
                controls.enabled = false;
                canvas.setPointerCapture(event.pointerId);
            }
        }
    }

    function handlePointerMove(event) {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        moveSelected(event);
    }

    function handlePointerUp(event) {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        dragState = null;
        controls.enabled = true;
        canvas.releasePointerCapture?.(event.pointerId);
    }

    function bindControls() {
        canvas.addEventListener("pointerdown", handlePointerDown);
        canvas.addEventListener("pointermove", handlePointerMove);
        canvas.addEventListener("pointerup", handlePointerUp);
        canvas.addEventListener("pointercancel", handlePointerUp);

        document.getElementById("artwork-grid")?.addEventListener("click", () => {
            requestAnimationFrame(() => {
                const cards = document.querySelectorAll("#artwork-grid .artwork-card");
                cards.forEach((card) => {
                    card.addEventListener("dblclick", () => {
                        const id = Number(card.dataset.artworkId);
                        const layer = Array.from(layers.values()).find((item) => Number(item.artwork.id) === id);
                        if (layer) selectLayer(layer.id);
                    }, { once: true });
                });
            });
        });

        window.addEventListener("customizer:layer-added", (event) => addLayer(event.detail.layer));
        window.addEventListener("customizer:layer-selected", (event) => selectLayer(event.detail.layerId));
        window.addEventListener("customizer:layer-deleted", (event) => {
            const item = layers.get(Number(event.detail.layerId));
            if (item) disposeDecal(item);
            layers.delete(Number(event.detail.layerId));
            if (selectedLayerId === Number(event.detail.layerId)) selectedLayerId = null;
            requestRender();
        });

        document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
            const item = layers.get(selectedLayerId);
            if (!item) return;
            const action = button.dataset.action;
            if (action === "scale-up" || action === "scale-down") {
                const factor = action === "scale-up" ? 1.06 : 0.94;
                item.layer.width = Math.min(1, Math.max(0.02, item.layer.width * factor));
                item.layer.height = Math.min(1, Math.max(0.02, item.layer.height * factor));
                rebuildDecal(item, item.position, item.normal);
            }
            if (action === "rotate-left" || action === "rotate-right") {
                const delta = action === "rotate-left" ? -5 : 5;
                item.layer.rotation = Math.max(-180, Math.min(180, item.layer.rotation + delta));
                rebuildDecal(item, item.position, item.normal);
            }
            if (action === "delete") {
                disposeDecal(item);
                layers.delete(selectedLayerId);
                selectedLayerId = null;
            }
            requestRender();
        }));

        document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
    }

    function setMode(mode) {
        const stage2d = document.getElementById("designer-2d-stage");
        const stage3d = document.getElementById("designer-3d-stage");
        const is3d = mode === "3d";
        stage2d?.classList.toggle("is-hidden", is3d);
        stage3d?.classList.toggle("is-hidden", !is3d);
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

        const hemi = new THREE.HemisphereLight(0xffffff, 0x8f8b82, 2.2);
        scene.add(hemi);

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

        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(4.5, 64),
            new THREE.MeshStandardMaterial({ color: 0xe9e5de, roughness: 0.95, metalness: 0 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.75;
        floor.receiveShadow = true;
        scene.add(floor);

        resizeRenderer();
    }

    async function loadModel() {
        const loader = new GLTFLoader();
        loading.textContent = "در حال بارگذاری لباس سه‌بعدی…";
        try {
            const gltf = await loader.loadAsync(modelView.model);
            modelRoot = gltf.scene;
            normalizeModel(modelRoot);
            setupModelMaterials(modelRoot);
            scene.add(modelRoot);
            loading.classList.add("is-hidden");
            requestRender();
        } catch (error) {
            console.error("Customizer 3D model load failed", error);
            loading.textContent = "مدل سه‌بعدی بارگذاری نشد؛ نمای چاپ در دسترس است.";
            loading.classList.remove("is-hidden");
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

    window.BabaeiCustomizer3D = {
        getPayload() {
            return Array.from(layers.values()).map((item) => ({
                ...item.layer,
                three_d: {
                    position: item.position ? item.position.toArray().map((value) => Number(value.toFixed(6))) : null,
                    normal: item.normal ? item.normal.toArray().map((value) => Number(value.toFixed(6))) : null,
                    mesh: item.targetMesh?.name || null,
                    size: item.size ? item.size.toArray().map((value) => Number(value.toFixed(6))) : null,
                    mode: "surface_decal",
                },
            }));
        },
        isReady() {
            return Boolean(modelRoot && renderer);
        },
        setMode,
    };

    initScene();
    bindControls();
    loadModel();
    animate();
    window.addEventListener("resize", resizeRenderer);
})();
