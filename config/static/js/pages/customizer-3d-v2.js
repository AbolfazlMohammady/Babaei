import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

(() => {
    "use strict";

    const root = document.getElementById("customizer");
    const stage = document.getElementById("designer-3d-stage");
    const canvas = document.getElementById("designer-3d-canvas");
    const loading = document.getElementById("designer-3d-loading");
    if (!root || !stage || !canvas) return;

    const data = JSON.parse(document.getElementById("designer-data")?.textContent || "{}");
    const views = data.views || [];
    const artworks = data.artworks || [];
    const variants = data.variants || [];
    const prices = data.prices || {};
    const basePrice = Number(data.base_price || 0);
    const modelViews = views.filter((view) => view.model);
    if (!modelViews.length) return;

    const artworkById = (id) => artworks.find((item) => Number(item.id) === Number(id));
    const layerMap = new Map();
    const textureCache = new Map();
    const modelMeshes = [];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const bounds = new THREE.Box3();
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);

    let scene;
    let camera;
    let renderer;
    let controls;
    let modelRoot;
    let environment;
    let pmrem;
    let selectedLayerId = null;
    let activeAreaId = null;
    let nextLayerId = 1;
    let dragState = null;
    let frameRequested = false;
    let modelRotationY = 0;
    let modelRadius = 1.8;
    let currentVariant = null;

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
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            return texture;
        });
        textureCache.set(url, promise);
        return promise;
    }

    function setupEnvironment() {
        pmrem = new THREE.PMREMGenerator(renderer);
        environment = new RoomEnvironment();
        const envMap = pmrem.fromScene(environment, 0.04).texture;
        scene.environment = envMap;
        scene.environmentIntensity = 0.72;
        environment.dispose();
        environment = null;
    }

    function normalizeModel(object, view) {
        bounds.setFromObject(object);
        bounds.getCenter(center);
        bounds.getSize(size);
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const scale = (3.05 / maxDimension) * Number(view.model_scale || 1);
        object.scale.multiplyScalar(scale);
        object.updateMatrixWorld(true);

        bounds.setFromObject(object);
        bounds.getCenter(center);
        bounds.getSize(size);
        object.position.sub(center);
        object.position.y -= size.y * 0.015;
        object.updateMatrixWorld(true);

        bounds.setFromObject(object);
        bounds.getSize(size);
        modelRadius = Math.max(size.x, size.y, size.z) * 0.58;
        camera.near = Math.max(0.01, modelRadius * 0.01);
        camera.far = Math.max(50, modelRadius * 40);
        camera.updateProjectionMatrix();
    }

    function cloneMaterial(material) {
        if (!material) return material;
        const cloned = material.clone();
        if ("envMapIntensity" in cloned) cloned.envMapIntensity = 1.25;
        if ("roughness" in cloned && !cloned.map) cloned.roughness = Math.min(0.9, Math.max(0.48, cloned.roughness || 0.72));
        if ("metalness" in cloned && !cloned.map) cloned.metalness = Math.min(0.08, cloned.metalness || 0);
        return cloned;
    }

    function setupModel(object) {
        object.traverse((mesh) => {
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = true;
            modelMeshes.push(mesh);
            if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(cloneMaterial);
            else mesh.material = cloneMaterial(mesh.material);
        });
        applyVariantColor();
    }

    function applyVariantColor() {
        if (!modelRoot || !currentVariant?.hex) return;
        const color = new THREE.Color(currentVariant.hex);
        modelRoot.traverse((mesh) => {
            if (!mesh.isMesh) return;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => {
                if (!material?.color) return;
                const hasTexture = Boolean(material.map || material.normalMap || material.roughnessMap);
                if (hasTexture) {
                    material.color.lerp(color, 0.22);
                } else {
                    material.color.copy(color);
                }
                material.needsUpdate = true;
            });
        });
        requestRender();
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
            ? [modelRoot, ...Array.from(layerMap.values()).map((item) => item.mesh).filter(Boolean)]
            : modelMeshes;
        return raycaster.intersectObjects(targets, true);
    }

    function hitNormal(hit) {
        const normal = hit.face?.normal?.clone() || new THREE.Vector3(0, 0, 1);
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
        const width = Math.max(0.035, modelRadius * 0.58 * Number(layer.width || 0.35) / 0.35);
        return new THREE.Vector3(width, width / aspect, Math.max(0.006, width * 0.025));
    }

    function decalMaterial(texture, selected) {
        return new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.025,
            opacity: 1,
            roughness: 0.58,
            metalness: 0,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -6,
            polygonOffsetUnits: -2,
            emissive: new THREE.Color(selected ? 0x332712 : 0x000000),
            emissiveIntensity: selected ? 0.16 : 0,
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
        const artwork = item.artwork;
        if (!artwork?.image) return;
        loadTexture(artwork.image).then((texture) => {
            if (!layerMap.has(item.id)) return;
            disposeDecal(item);
            item.position = point.clone();
            item.normal = normal.clone().normalize();
            item.size = decalSize(item.layer, texture);
            const target = item.targetMesh || modelMeshes[0];
            if (!target) return;
            const geometry = new DecalGeometry(
                target,
                item.position,
                orientationFor(item.normal, item.layer.rotation),
                item.size,
            );
            const mesh = new THREE.Mesh(geometry, decalMaterial(texture, item.id === selectedLayerId));
            mesh.renderOrder = 30 + Number(item.layer.z_index || 0);
            mesh.userData.customizerLayerId = item.id;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            scene.add(mesh);
            item.mesh = mesh;
            requestRender();
        }).catch(() => setStatus("تصویر لیبل برای پیش‌نمایش سه‌بعدی بارگذاری نشد."));
    }

    function centerHit() {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        return raycaster.intersectObjects(modelMeshes, true)[0] || null;
    }

    function activeArea() {
        if (activeAreaId) {
            for (const view of views) {
                const area = (view.areas || []).find((item) => Number(item.id) === Number(activeAreaId));
                if (area) return area;
            }
        }
        return modelViews[0]?.areas?.[0] || views[0]?.areas?.[0] || null;
    }

    function addLayer(artworkId) {
        const artwork = artworkById(artworkId);
        const hit = centerHit();
        const area = activeArea();
        if (!artwork || !hit || !area) return;

        const maxLayers = Number(area.max_layers || 3);
        const count = Array.from(layerMap.values()).filter((item) => Number(item.layer.area_id) === Number(area.id)).length;
        if (count >= maxLayers) {
            setStatus(`در «${area.name}» بیشتر از ${maxLayers} لیبل مجاز نیست.`);
            return;
        }

        const layer = {
            id: nextLayerId++,
            artwork_id: artwork.id,
            area_id: area.id,
            x: 0.5,
            y: 0.5,
            width: 0.35,
            height: 0.25,
            rotation: 0,
            z_index: layerMap.size,
        };
        const item = {
            id: layer.id,
            layer,
            artwork,
            targetMesh: hit.object,
            position: hit.point.clone(),
            normal: hitNormal(hit),
            mesh: null,
            size: null,
        };
        layerMap.set(item.id, item);
        selectedLayerId = item.id;
        activeAreaId = area.id;
        project(item, item.position, item.normal);
        syncDesignerUi();
    }

    function selectLayer(id) {
        selectedLayerId = id == null ? null : Number(id);
        layerMap.forEach((item) => {
            if (!item.mesh?.material) return;
            const selected = item.id === selectedLayerId;
            item.mesh.material.emissive?.setHex(selected ? 0x332712 : 0x000000);
            item.mesh.material.emissiveIntensity = selected ? 0.16 : 0;
        });
        syncDesignerUi();
        requestRender();
    }

    function moveSelected(event) {
        const item = layerMap.get(selectedLayerId);
        if (!item) return false;
        const hit = garmentHits(event)[0];
        if (!hit) return false;
        item.targetMesh = hit.object;
        project(item, hit.point, hitNormal(hit));
        return true;
    }

    function savePayload() {
        return Array.from(layerMap.values()).map((item) => ({
            ...item.layer,
            three_d: {
                position: item.position?.toArray().map((value) => Number(value.toFixed(6))) || null,
                normal: item.normal?.toArray().map((value) => Number(value.toFixed(6))) || null,
                mesh: item.targetMesh?.name || null,
                size: item.size?.toArray().map((value) => Number(value.toFixed(6))) || null,
                model_view_id: modelViews[0]?.id || null,
                mode: "surface_decal",
            },
        }));
    }

    function formatPrice(value) {
        return Number(value || 0).toLocaleString("fa-IR");
    }

    function syncDesignerUi() {
        const selected = layerMap.get(selectedLayerId);
        const selectedCard = document.getElementById("selected-card");
        const priceBreakdown = document.getElementById("price-breakdown");
        const totalEl = document.getElementById("designer-total");
        const selectedControls = document.getElementById("selected-controls");
        const premiumSelected = document.getElementById("premium-selected-artwork");

        if (selectedCard) {
            if (!selected) {
                selectedCard.innerHTML = '<span class="selected-card__empty">یک لیبل را انتخاب کنید.</span>';
            } else {
                const area = activeArea();
                selectedCard.innerHTML = `<div class="selected-card__title">${selected.artwork.name || "لیبل"}</div><span class="selected-card__meta">${area?.name || "ناحیه چاپ"} · ${Math.round(selected.layer.width * 100)}% × ${Math.round(selected.layer.height * 100)}%</span>`;
            }
        }
        if (selectedControls) selectedControls.hidden = !selected;
        if (premiumSelected) {
            premiumSelected.innerHTML = selected
                ? `<div class="premium-selected-artwork__name">لیبل انتخاب‌شده: <strong>${selected.artwork.name || "لیبل"}</strong></div><div class="premium-selected-artwork__hint">برای جابه‌جایی، مستقیماً روی لیبل بکش.</div>`
                : "";
        }

        let total = currentVariant ? Number(currentVariant.price) : basePrice;
        const lines = [`<div class="price-line"><span>محصول</span><strong>${formatPrice(total)} تومان</strong></div>`];
        layerMap.forEach((item) => {
            const key = `${item.layer.artwork_id}:${item.layer.area_id}`;
            const price = Object.prototype.hasOwnProperty.call(prices, key) ? Number(prices[key]) : Number(item.artwork.base_price || 0);
            total += price;
            lines.push(`<div class="price-line"><span>${item.artwork.name || "لیبل"}</span><strong>+ ${formatPrice(price)}</strong></div>`);
        });
        if (priceBreakdown) priceBreakdown.innerHTML = lines.join("");
        if (totalEl) totalEl.textContent = formatPrice(total);
    }

    function renderVariantColors() {
        const host = document.getElementById("variant-color-list");
        if (!host) return;
        const unique = [];
        const seen = new Set();
        variants.forEach((variant) => {
            if (!seen.has(variant.color)) {
                seen.add(variant.color);
                unique.push(variant);
            }
        });
        host.innerHTML = unique.map((variant) => `<button type="button" class="premium-color-button" style="--swatch:${variant.hex || "#c9c4ba"}" data-variant-color="${variant.color}" title="${variant.color}" aria-label="${variant.color}"></button>`).join("");
        host.querySelectorAll(".premium-color-button").forEach((button) => button.addEventListener("click", () => {
            const variant = variants.find((item) => item.color === button.dataset.variantColor && Number(item.stock) > 0) || variants.find((item) => item.color === button.dataset.variantColor);
            if (!variant) return;
            const select = document.getElementById("variant-select");
            if (select) select.value = String(variant.id);
            currentVariant = variant;
            host.querySelectorAll(".premium-color-button").forEach((item) => item.classList.toggle("is-active", item === button));
            applyVariantColor();
            syncDesignerUi();
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

            if (event.altKey || event.button === 1) return;
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
            syncDesignerUi();
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
            const item = layerMap.get(selectedLayerId);
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
                layerMap.delete(selectedLayerId);
                selectedLayerId = null;
            }
            syncDesignerUi();
            requestRender();
        }));

        document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

        document.getElementById("variant-select")?.addEventListener("change", (event) => {
            currentVariant = variants.find((item) => String(item.id) === String(event.target.value)) || null;
            applyVariantColor();
            syncDesignerUi();
        });

        document.getElementById("view-switcher")?.addEventListener("click", () => {
            window.setTimeout(() => {
                const index = Number(document.querySelector("#view-switcher .view-button.is-active")?.dataset.viewIndex || 0);
                activeAreaId = views[index]?.areas?.[0]?.id || activeAreaId;
            }, 0);
        });

        document.getElementById("designer-3d-rotation")?.addEventListener("input", (event) => {
            modelRotationY = THREE.MathUtils.degToRad(Number(event.target.value));
            if (modelRoot) modelRoot.rotation.y = modelRotationY;
            requestRender();
        });

        document.getElementById("designer-3d-reset")?.addEventListener("click", () => {
            modelRotationY = 0;
            if (modelRoot) modelRoot.rotation.y = 0;
            if (controls) {
                controls.reset();
                controls.target.set(0, 0, 0);
            }
            const slider = document.getElementById("designer-3d-rotation");
            if (slider) slider.value = "0";
            requestRender();
        });

        document.getElementById("save-design")?.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const button = event.currentTarget;
            button.disabled = true;
            setStatus("در حال بررسی و ذخیره طراحی سه‌بعدی…");
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
                setStatus(`طراحی سه‌بعدی ذخیره شد · کد ${result.draft_id.slice(0, 8)}`);
            } catch (error) {
                setStatus(error.message || "ذخیره طراحی انجام نشد.");
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
        if (is3d) resizeRenderer();
    }

    function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x141414);
        camera = new THREE.PerspectiveCamera(30, 1, 0.02, 100);
        camera.position.set(0, 0.12, 4.7);

        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            preserveDrawingBuffer: false,
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        setupEnvironment();

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.065;
        controls.enablePan = false;
        controls.rotateSpeed = 0.72;
        controls.zoomSpeed = 0.82;
        controls.minDistance = 1.7;
        controls.maxDistance = 8.5;
        controls.minPolarAngle = 0.68;
        controls.maxPolarAngle = 2.42;
        controls.target.set(0, 0.02, 0);
        controls.addEventListener("change", requestRender);

        const key = new THREE.DirectionalLight(0xffffff, 4.4);
        key.position.set(3.8, 5.4, 4.6);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.near = 0.1;
        key.shadow.camera.far = 18;
        key.shadow.bias = -0.00015;
        scene.add(key);

        const fill = new THREE.DirectionalLight(0xc9d7ff, 1.65);
        fill.position.set(-4, 2.5, 1.5);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffd9a6, 2.1);
        rim.position.set(2.5, 3.2, -4.5);
        scene.add(rim);

        const top = new THREE.PointLight(0xffffff, 1.0, 10);
        top.position.set(0, 4, 0);
        scene.add(top);

        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(5.5, 96),
            new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.82, metalness: 0.02 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.72;
        floor.receiveShadow = true;
        scene.add(floor);

        resizeRenderer();
    }

    async function loadModel(view) {
        if (!view?.model) throw new Error("مدل سه‌بعدی برای این محصول تعریف نشده است.");
        loading.classList.remove("is-hidden");
        loading.textContent = "در حال بارگذاری مدل واقعی محصول…";

        const loader = new GLTFLoader();
        loader.setCrossOrigin("anonymous");
        const draco = new DRACOLoader();
        draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/draco/");
        draco.setWorkerLimit(2);
        loader.setDRACOLoader(draco);

        const gltf = await loader.loadAsync(view.model);
        draco.dispose();
        if (modelRoot) {
            scene.remove(modelRoot);
            modelRoot.traverse((node) => {
                if (!node.isMesh) return;
                node.geometry?.dispose();
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.forEach((material) => material?.dispose?.());
            });
        }
        modelMeshes.length = 0;
        modelRoot = gltf.scene;
        normalizeModel(modelRoot, view);
        setupModel(modelRoot);
        modelRoot.rotation.y = modelRotationY;
        scene.add(modelRoot);

        loading.classList.add("is-hidden");
        requestRender();
    }

    function show3DFailure(message) {
        console.error("Customizer 3D model load failed", message);
        loading.textContent = "مدل سه‌بعدی این محصول آماده نیست؛ نمای چاپ در دسترس است.";
        document.getElementById("designer-3d-stage")?.classList.add("is-hidden");
        document.getElementById("designer-2d-stage")?.classList.remove("is-hidden");
        document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === "2d"));
    }

    async function bootModel() {
        try {
            const view = modelViews[0];
            await loadModel(view);
        } catch (error) {
            show3DFailure(error);
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        controls?.update();
        renderer?.render(scene, camera);
    }

    renderVariantColors();
    currentVariant = variants.find((item) => Number(item.stock) > 0) || variants[0] || null;
    if (currentVariant) {
        const select = document.getElementById("variant-select");
        if (select && !select.value) select.value = String(currentVariant.id);
    }
    bindInteraction();
    initScene();
    bootModel();
    syncDesignerUi();
    animate();
    window.addEventListener("resize", resizeRenderer);

    window.BabaeiCustomizer3D = {
        getPayload: savePayload,
        isReady: () => Boolean(modelRoot && renderer),
        setMode,
        addArtwork: addLayer,
    };
})();
