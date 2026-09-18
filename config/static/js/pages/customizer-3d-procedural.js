import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

(() => {
    "use strict";

    const root = document.getElementById("customizer");
    const stage = document.getElementById("designer-3d-stage");
    const canvas = document.getElementById("designer-3d-canvas");
    if (!root || !stage || !canvas) return;

    let data = {};
    try {
        data = JSON.parse(document.getElementById("designer-data")?.textContent || "{}");
    } catch (error) {
        console.error("Invalid designer data", error);
        return;
    }

    const artworks = data.artworks || [];
    const variants = data.variants || [];
    const prices = data.prices || {};
    const areas = (data.views || []).flatMap(view => view.areas || []);
    const basePrice = Number(data.base_price || 0);
    const artworkById = id => artworks.find(item => Number(item.id) === Number(id));
    const areaById = id => areas.find(item => Number(item.id) === Number(id));
    const esc = value => String(value ?? "").replace(/[&<>\\"']/g, char => ({
        "&":"&amp;","<":"&lt;",">":"&gt;","\\":"&quot;","'":"&#39;"
    }[char]));
    const money = value => Number(value || 0).toLocaleString("fa-IR");

    let scene, camera, renderer, controls, garment;
    let garmentMeshes = [];
    let garmentMaterials = [];
    let garmentMaxSize = 3;
    let baseCameraDistance = 5.6;
    let currentVariant = null;
    let selectedId = null;
    let activeAreaId = areas[0]?.id || null;
    let nextId = 1;
    let drag = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const layers = new Map();
    const textures = new Map();
    const frontAxis = new THREE.Vector3(0, 0, 1);
    const modelUrl = stage.dataset.modelUrl;

    function status(text) {
        const el = document.getElementById("save-status");
        if (el) el.textContent = text || "";
    }

    function setLoading(text, visible = true) {
        const el = document.getElementById("designer-3d-loading");
        if (!el) return;
        el.textContent = text || "";
        el.classList.toggle("is-hidden", !visible);
    }

    function csrf() {
        const token = document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith("csrftoken="));
        return token ? decodeURIComponent(token.slice(10)) : "";
    }

    function setupScene() {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);

        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const pmrem = new THREE.PMREMGenerator(renderer);
        const environment = new RoomEnvironment();
        scene.environment = pmrem.fromScene(environment, 0.03).texture;
        scene.environmentIntensity = 0.55;
        environment.dispose();
        pmrem.dispose();

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.055;
        controls.enablePan = false;
        controls.rotateSpeed = 0.62;
        controls.zoomSpeed = 0.72;
        controls.minPolarAngle = 0.82;
        controls.maxPolarAngle = 2.32;
        controls.target.set(0, 0, 0);
        controls.addEventListener("change", render);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x141414, 1.25));

        const key = new THREE.DirectionalLight(0xffffff, 3.2);
        key.position.set(3.5, 4.5, 5.5);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0xdfe8ff, 1.25);
        fill.position.set(-4, 2.5, 2.5);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffdfb2, 1.15);
        rim.position.set(2.5, 3.2, -4.5);
        scene.add(rim);
    }

    function prepareMaterial(material) {
        if (!material) return;
        if (material.isMaterial) {
            material.needsUpdate = true;
            if ("roughness" in material && material.roughness == null) material.roughness = 0.82;
            if ("metalness" in material && material.metalness == null) material.metalness = 0;
            garmentMaterials.push(material);
        }
    }

    function normalizeGarment(rootObject) {
        const box = new THREE.Box3().setFromObject(rootObject);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxSize = Math.max(size.x, size.y, size.z) || 1;

        const targetHeight = 2.72;
        rootObject.scale.setScalar(targetHeight / maxSize);

        const scaledBox = new THREE.Box3().setFromObject(rootObject);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        rootObject.position.sub(scaledCenter);
        rootObject.position.y += 0.02;

        const finalBox = new THREE.Box3().setFromObject(rootObject);
        const finalSize = finalBox.getSize(new THREE.Vector3());
        const finalMax = Math.max(finalSize.x, finalSize.y, finalSize.z);

        garmentMaxSize = finalMax;
        controls.target.set(0, finalSize.y * 0.03, 0);
        controls.minDistance = Math.max(2.6, finalMax * 0.72);
        controls.maxDistance = Math.max(8.5, finalMax * 2.5);
        fitCamera(true);
    }

    async function loadGarment() {
        if (!modelUrl) throw new Error("مدل سه‌بعدی تیشرت تعریف نشده است.");

        setLoading("در حال بارگذاری مدل سه‌بعدی…", true);
        const loader = new GLTFLoader();

        const gltf = await new Promise((resolve, reject) => {
            loader.load(
                modelUrl,
                resolve,
                event => {
                    if (!event.total) {
                        setLoading("در حال بارگذاری مدل سه‌بعدی…", true);
                        return;
                    }
                    const percent = Math.round((event.loaded / event.total) * 100);
                    setLoading(`در حال بارگذاری مدل سه‌بعدی… ${percent}%`, true);
                },
                reject
            );
        });

        garment = gltf.scene;
        garment.name = "BabaeiTshirtGLB";
        garment.traverse(object => {
            if (!object.isMesh) return;

            object.castShadow = true;
            object.receiveShadow = true;
            object.frustumCulled = true;
            garmentMeshes.push(object);

            if (Array.isArray(object.material)) object.material.forEach(prepareMaterial);
            else prepareMaterial(object.material);
        });

        if (!garmentMeshes.length) throw new Error("GLB فاقد Mesh قابل نمایش است.");

        // Keep the original PBR materials/textures from the supplied GLB.
        scene.add(garment);
        normalizeGarment(garment);
        setLoading("", false);
        render();
    }


    function fitCamera(initial = false) {
        if (!camera || !controls) return;
        const aspect = Math.max(0.45, camera.aspect || 1);
        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
        const verticalDistance = garmentMaxSize / (2 * Math.tan(verticalFov / 2));
        const horizontalDistance = garmentMaxSize / (2 * Math.tan(horizontalFov / 2));
        const distance = Math.max(4.7, verticalDistance, horizontalDistance) * 1.16;
        baseCameraDistance = distance;
        camera.position.set(0, garmentMaxSize * 0.015, distance);
        controls.target.set(0, garmentMaxSize * 0.025, 0);
        if (initial) controls.update();
        camera.updateProjectionMatrix();
        render();
        updateCameraZoomLabel();
    }

    function updateCameraZoomLabel() {
        const label = document.getElementById("camera-zoom-label");
        if (!label || !camera || !controls) return;
        const current = camera.position.distanceTo(controls.target);
        const percent = Math.round((baseCameraDistance / Math.max(current, 0.01)) * 100);
        label.textContent = `${percent}%`;
    }

    function changeCameraZoom(factor) {
        if (!camera || !controls) return;
        const target = controls.target.clone();
        const direction = camera.position.clone().sub(target).normalize();
        const current = camera.position.distanceTo(target);
        const next = THREE.MathUtils.clamp(current * factor, controls.minDistance, controls.maxDistance);
        camera.position.copy(target).add(direction.multiplyScalar(next));
        controls.update();
        updateCameraZoomLabel();
        render();
    }

    function rotateGarment(step) {
        if (!garment) return;
        garment.rotation.y += THREE.MathUtils.degToRad(step);
        render();
    }

    function resize() {
        if (!renderer || !camera) return;
        const width = Math.max(1, stage.clientWidth);
        const height = Math.max(1, stage.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (garment) fitCamera();
        else render();
    }

    function render() {
        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    function setColor(hex) {
        const base = new THREE.Color(hex || "#ffffff");
        garmentMaterials.forEach(material => {
            if (!material?.color) return;
            material.color.copy(base);
            material.needsUpdate = true;
        });
        render();
    }

    function loadTexture(url) {
        if (textures.has(url)) return textures.get(url);
        const promise = new THREE.TextureLoader().loadAsync(url).then(texture => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
            return texture;
        });
        textures.set(url, promise);
        return promise;
    }

    function pointerOf(event) {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function garmentHits(event) {
        pointerOf(event);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(garmentMeshes, false);
    }

    function centerHit() {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        return raycaster.intersectObjects(garmentMeshes, false)[0] || null;
    }

    function hitNormal(hit) {
        return (hit.face?.normal?.clone() || frontAxis.clone())
            .transformDirection(hit.object.matrixWorld)
            .normalize();
    }

    function orientation(normal, rotation) {
        const n = normal.clone().normalize();
        const align = new THREE.Quaternion().setFromUnitVectors(frontAxis, n);
        const spin = new THREE.Quaternion().setFromAxisAngle(n, THREE.MathUtils.degToRad(rotation));
        return new THREE.Euler().setFromQuaternion(spin.multiply(align));
    }

    function disposeLayer(item) {
        if (!item?.mesh) return;
        item.mesh.geometry?.dispose();
        // Textures are cached/shared between projections; dispose only the
        // per-decal material, otherwise a drag would invalidate the cached texture. 
        item.mesh.material?.dispose();
        item.mesh.parent?.remove(item.mesh);
        if (item.frame) {
            item.frame.geometry?.dispose();
            item.frame.material?.dispose();
            item.frame.parent?.remove(item.frame);
            item.frame = null;
        }
        item.mesh = null;
    }

    function project(item, point, normal) {
        if (!item?.artwork?.image || !garmentMeshes.length) return;

        // Keep the real cloth anchor separate from the tiny visual lift. The old
        // code re-used item.position when resizing, so the 0.018 offset was added
        // again and again until the decal floated away and disappeared.
        const surfacePoint = point.clone();
        const surfaceNormal = normal.clone().normalize();
        const revision = (item.projectRevision || 0) + 1;
        item.projectRevision = revision;

        loadTexture(item.artwork.image).then(texture => {
            if (!layers.has(item.id) || item.projectRevision !== revision) return;

            item.normal = surfaceNormal.clone();
            item.surfacePoint = surfacePoint.clone();
            item.surfaceNormal = surfaceNormal.clone();
            item.position = surfacePoint.clone().addScaledVector(surfaceNormal, 0.008);

            const aspect = Math.max(
                0.15,
                (texture.image?.width || 1) / Math.max(1, texture.image?.height || 1)
            );

            const width = Math.max(0.08, Math.min(1.05, 0.86 * Number(item.layer.width || 0.35)));
            const size = new THREE.Vector3(
                width,
                width / aspect,
                Math.max(0.24, width * 0.9)
            );
            item.size = size;

            const target = item.target?.isMesh ? item.target : garmentMeshes[0];
            const geometry = new DecalGeometry(
                target,
                item.position,
                orientation(item.normal, item.layer.rotation),
                size
            );

            // DecalGeometry can legitimately produce an empty geometry when the
            // pointer is on a thin/angled part of the garment (especially sleeves).
            // Never remove the currently visible label until the replacement has
            // actually intersected the garment.
            if (!geometry.attributes.position?.count) {
                geometry.dispose();
                return;
            }

            const material = new THREE.MeshPhysicalMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.02,
                roughness: 0.72,
                metalness: 0,
                clearcoat: 0.03,
                depthTest: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -5,
                polygonOffsetUnits: -2,
                side: THREE.DoubleSide,
            });

            // DecalGeometry is generated in world space. Convert it into the target
            // mesh's local space and parent it to that mesh so it stays physically
            // attached when the garment rotates.
            geometry.applyMatrix4(target.matrixWorld.clone().invert());

            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 30 + Number(item.layer.z_index || 0);
            mesh.userData.customizerLayerId = item.id;
            target.add(mesh);

            // Professional selection frame: a subtle gold outline that follows the
            // same surface/rotation as the decal and remains attached to the garment.
            const frameGeometry = new THREE.EdgesGeometry(
                new THREE.PlaneGeometry(size.x, size.y)
            );
            const frameMaterial = new THREE.LineBasicMaterial({
                color: 0xd8b66b,
                transparent: true,
                opacity: 0.92,
                depthTest: false,
                depthWrite: false,
            });
            const frame = new THREE.LineSegments(frameGeometry, frameMaterial);
            const targetWorldPosition = item.position.clone();
            target.worldToLocal(targetWorldPosition);
            frame.position.copy(targetWorldPosition);
            const worldQuaternion = new THREE.Quaternion().setFromEuler(
                orientation(item.normal, item.layer.rotation)
            );
            const targetWorldQuaternion = target.getWorldQuaternion(new THREE.Quaternion());
            frame.quaternion.copy(targetWorldQuaternion.invert().multiply(worldQuaternion));
            frame.userData.customizerLayerId = item.id;
            frame.renderOrder = 80;
            target.add(frame);

            const previousMesh = item.mesh;
            const previousFrame = item.frame;

            item.mesh = mesh;
            item.frame = frame;

            if (previousMesh) {
                previousMesh.geometry?.dispose();
                previousMesh.material?.dispose();
                previousMesh.parent?.remove(previousMesh);
            }
            if (previousFrame) {
                previousFrame.geometry?.dispose();
                previousFrame.material?.dispose();
                previousFrame.parent?.remove(previousFrame);
            }

            render();
        }).catch(() => status("تصویر لیبل برای پیش‌نمایش بارگذاری نشد."));
    }

    function addLayer(artworkId) {
        const artwork = artworkById(artworkId);
        const area = areaById(activeAreaId);
        const hit = centerHit();

        if (!artwork || !area || !hit) {
            status("ابتدا ناحیه چاپ را انتخاب کنید.");
            return;
        }

        const count = Array.from(layers.values())
            .filter(item => Number(item.layer.area_id) === Number(area.id)).length;
        const max = Number(area.max_layers || 3);

        if (count >= max) {
            status(`در «${area.name}» بیشتر از ${max} لیبل مجاز نیست.`);
            return;
        }

        const layer = {
            id: nextId++,
            artwork_id: artwork.id,
            area_id: area.id,
            x: 0.5,
            y: 0.5,
            width: 0.35,
            height: 0.25,
            rotation: 0,
            z_index: layers.size,
        };

        const item = {
            id: layer.id,
            layer,
            artwork,
            target: hit.object,
            position: hit.point.clone(),
            normal: hitNormal(hit),
            surfacePoint: hit.point.clone(),
            surfaceNormal: hitNormal(hit),
            projectRevision: 0,
            mesh: null,
            frame: null,
            size: null,
        };

        layers.set(item.id, item);
        selectedId = item.id;
        project(item, item.surfacePoint, item.surfaceNormal);
        sync();
    }

    function moveSelected(event) {
        const item = layers.get(selectedId);
        if (!item) return;

        // A drag is an explicit placement action, so follow the garment mesh
        // currently under the pointer. This allows torso -> sleeve placement,
        // while ordinary clicks still never move a selected label.
        pointerOf(event);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(garmentMeshes, false)[0];
        if (!hit) return;

        item.target = hit.object;
        project(item, hit.point, hitNormal(hit));
    }

    function renderAreas() {
        const host = document.getElementById("area-list");
        if (!host) return;

        if (!activeAreaId) activeAreaId = areas[0]?.id || null;

        host.innerHTML = areas.map(area => {
            const count = Array.from(layers.values())
                .filter(item => Number(item.layer.area_id) === Number(area.id)).length;

            return `<button type="button" class="area-option ${Number(area.id) === Number(activeAreaId) ? "is-active" : ""}" data-area-id="${area.id}">
                <span>${esc(area.name)}</span><small>${count}/${Number(area.max_layers || 3)}</small>
            </button>`;
        }).join("");

        host.querySelectorAll(".area-option").forEach(button => {
            button.addEventListener("click", () => {
                activeAreaId = Number(button.dataset.areaId);
                sync();
            });
        });
    }

    function sync() {
        const selected = layers.get(selectedId);
        const card = document.getElementById("selected-card");
        const controls = document.getElementById("selected-controls");
        const chosen = document.getElementById("premium-selected-artwork");
        const scaleInput = document.getElementById("label-scale");
        const rotationInput = document.getElementById("label-rotation");

        if (card) {
            card.innerHTML = selected
                ? `<div class="selected-card__title">${esc(selected.artwork.name || "لیبل")}</div><span class="selected-card__meta">${esc(areaById(selected.layer.area_id)?.name || "ناحیه چاپ")} · ${Math.round(selected.layer.width * 100)}%</span>`
                : `<span class="selected-card__empty">یک لیبل را انتخاب کنید.</span>`;
        }

        if (controls) controls.hidden = !selected;
        layers.forEach(item => {
            if (item.frame) item.frame.visible = item.id === selectedId;
        });
        if (scaleInput) {
            scaleInput.disabled = !selected;
            scaleInput.value = selected ? String(Math.round(selected.layer.width * 100)) : "35";
        }
        if (rotationInput) {
            rotationInput.disabled = !selected;
            rotationInput.value = selected ? String(Math.round(selected.layer.rotation)) : "0";
        }

        if (chosen) {
            chosen.innerHTML = selected
                ? `<div class="premium-selected-artwork__name">لیبل انتخاب‌شده: <strong>${esc(selected.artwork.name || "لیبل")}</strong></div><div class="premium-selected-artwork__hint">برای جابه‌جایی، مستقیم روی تیشرت بکش.</div>`
                : "";
        }

        let total = currentVariant ? Number(currentVariant.price) : basePrice;
        const lines = [`<div class="price-line"><span>تیشرت</span><strong>${money(total)} تومان</strong></div>`];

        layers.forEach(item => {
            const key = `${item.layer.artwork_id}:${item.layer.area_id}`;
            const price = Object.prototype.hasOwnProperty.call(prices, key)
                ? Number(prices[key])
                : Number(item.artwork.base_price || 0);
            total += price;
            lines.push(`<div class="price-line"><span>${esc(item.artwork.name || "لیبل")}</span><strong>+ ${money(price)}</strong></div>`);
        });

        const breakdown = document.getElementById("price-breakdown");
        if (breakdown) breakdown.innerHTML = lines.join("");

        const totalEl = document.getElementById("designer-total");
        if (totalEl) totalEl.textContent = money(total);

        renderAreas();
    }

    function saveLayers() {
        return Array.from(layers.values()).map(item => ({
            ...item.layer,
            three_d: {
                position: item.position?.toArray().map(value => Number(value.toFixed(6))) || null,
                normal: item.normal?.toArray().map(value => Number(value.toFixed(6))) || null,
                mesh: item.target?.name || null,
                size: item.size?.toArray().map(value => Number(value.toFixed(6))) || null,
                mode: "glb_surface_decal",
                template: "babaei_tshirt_glb_v1",
                model: "Glb/whit_t_shirt.glb",
            },
        }));
    }

    function bind() {
        canvas.addEventListener("pointerdown", event => {
            const intersections = garmentHits(event);
            const decal = raycaster.intersectObjects(
                Array.from(layers.values()).map(item => item.mesh).filter(Boolean),
                true
            ).find(hit => hit.object?.userData?.customizerLayerId != null);

            if (decal) {
                selectedId = Number(decal.object.userData.customizerLayerId);
                drag = { pointerId: event.pointerId };
                controls.enabled = false;
                canvas.setPointerCapture(event.pointerId);
                sync();
                return;
            }

            if (event.button === 1 || event.altKey) return;

            // A selected label must only move after the user starts dragging the label itself.
            // Clicking another point on the garment must never teleport the selected label.
            return;
        });

        canvas.addEventListener("pointermove", event => {
            if (drag?.pointerId === event.pointerId) moveSelected(event);
        });

        ["pointerup", "pointercancel"].forEach(type => {
            canvas.addEventListener(type, event => {
                if (drag?.pointerId !== event.pointerId) return;
                drag = null;
                controls.enabled = true;
                canvas.releasePointerCapture?.(event.pointerId);
                sync();
            });
        });

        document.getElementById("artwork-grid")?.addEventListener("click", event => {
            const card = event.target.closest(".artwork-card");
            if (card) addLayer(Number(card.dataset.artworkId));
        });

        document.querySelectorAll("[data-action]").forEach(button => {
            button.addEventListener("click", () => {
                const item = layers.get(selectedId);
                if (!item) return;

                const action = button.dataset.action;

                if (action === "scale-up" || action === "scale-down") {
                    const factor = action === "scale-up" ? 1.06 : 0.94;
                    item.layer.width = Math.min(0.98, Math.max(0.06, item.layer.width * factor));
                    item.layer.height = Math.min(0.98, Math.max(0.04, item.layer.height * factor));
                    project(item, item.surfacePoint || item.position, item.surfaceNormal || item.normal);
                } else if (action === "rotate-left" || action === "rotate-right") {
                    item.layer.rotation = Math.max(
                        -180,
                        Math.min(180, item.layer.rotation + (action === "rotate-left" ? -5 : 5))
                    );
                    project(item, item.surfacePoint || item.position, item.surfaceNormal || item.normal);
                } else if (action === "center-label") {
                    const hit = centerHit();
                    if (hit) {
                        item.target = hit.object;
                        project(item, hit.point, hitNormal(hit));
                    }
                } else if (action === "delete") {
                    disposeLayer(item);
                    layers.delete(selectedId);
                    selectedId = null;
                }

                sync();
                render();
            });
        });

        document.querySelectorAll("[data-mode]").forEach(button => {
            button.addEventListener("click", () => {
                const is3d = button.dataset.mode === "3d";
                document.getElementById("designer-2d-stage")?.classList.toggle("is-hidden", is3d);
                stage.classList.toggle("is-hidden", !is3d);
                document.querySelectorAll("[data-mode]").forEach(item => item.classList.toggle("is-active", item === button));
                if (is3d) resize();
            });
        });

        document.getElementById("variant-select")?.addEventListener("change", event => {
            currentVariant = variants.find(variant => String(variant.id) === String(event.target.value)) || null;
            setColor(currentVariant?.hex || "#ffffff");
            sync();
        });

        document.getElementById("designer-3d-rotation")?.addEventListener("input", event => {
            if (!garment) return;
            garment.rotation.y = THREE.MathUtils.degToRad(Number(event.target.value));
            render();
        });

        document.getElementById("label-scale")?.addEventListener("input", event => {
            const item = layers.get(selectedId);
            if (!item) return;
            const value = THREE.MathUtils.clamp(Number(event.target.value) / 100, 0.06, 0.98);
            item.layer.width = value;
            item.layer.height = Math.max(0.04, Math.min(0.78, value * 0.72));
            project(item, item.surfacePoint || item.position, item.surfaceNormal || item.normal);
            sync();
        });

        document.getElementById("label-rotation")?.addEventListener("input", event => {
            const item = layers.get(selectedId);
            if (!item) return;
            item.layer.rotation = THREE.MathUtils.clamp(Number(event.target.value), -180, 180);
            project(item, item.surfacePoint || item.position, item.surfaceNormal || item.normal);
            sync();
        });

        document.querySelectorAll("[data-camera-action]").forEach(button => {
            button.addEventListener("click", () => {
                const action = button.dataset.cameraAction;
                if (action === "rotate-left") rotateGarment(-15);
                if (action === "rotate-right") rotateGarment(15);
                if (action === "zoom-in") changeCameraZoom(0.88);
                if (action === "zoom-out") changeCameraZoom(1.14);
                if (action === "fit") fitCamera();
                if (action === "reset") {
                    if (garment) garment.rotation.y = 0;
                    controls?.reset();
                    fitCamera();
                }
            });
        });

        document.getElementById("designer-3d-reset")?.addEventListener("click", () => {
            if (garment) garment.rotation.y = 0;
            controls?.reset();
            fitCamera();
            render();
        });

        document.getElementById("save-design")?.addEventListener("click", async event => {
            event.preventDefault();
            event.stopImmediatePropagation();

            const button = event.currentTarget;
            button.disabled = true;
            status("در حال ذخیره طراحی…");

            try {
                const response = await fetch(root.dataset.saveUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        variant_id: document.getElementById("variant-select")?.value || null,
                        version: 3,
                        preview_mode: "3d_glb_tshirt",
                        layers: saveLayers(),
                    }),
                });

                const result = await response.json();
                if (!response.ok || !result.ok) throw new Error(result.error || "ذخیره طراحی انجام نشد.");
                status(`طراحی ذخیره شد · کد ${String(result.draft_id).slice(0, 8)}`);
            } catch (error) {
                status(error.message || "ذخیره طراحی انجام نشد.");
            } finally {
                button.disabled = false;
            }
        }, { capture: true });
    }

    async function init() {
        setupScene();
        currentVariant = variants.find(variant => Number(variant.stock) > 0) || variants[0] || null;

        const variantSelect = document.getElementById("variant-select");
        if (variantSelect && currentVariant) variantSelect.value = currentVariant.id;

        renderAreas();
        bind();
        resize();

        try {
            await loadGarment();
            setColor(currentVariant?.hex || "#ffffff");
            sync();
        } catch (error) {
            console.error("GLB customizer model failed to load", error);
            setLoading("بارگذاری مدل سه‌بعدی انجام نشد.", true);
            status("مدل سه‌بعدی تیشرت بارگذاری نشد. مسیر GLB یا دسترسی فایل را بررسی کنید.");
        }
    }

    init();

    function animate() {
        requestAnimationFrame(animate);
        controls?.update();
        renderer?.render(scene, camera);
    }

    animate();
    window.addEventListener("resize", resize);

    window.BabaeiCustomizer3D = {
        getPayload: saveLayers,
        isReady: () => Boolean(garment && garmentMeshes.length),
        setMode: mode => document.querySelector(`[data-mode="${mode}"]`)?.click(),
        addArtwork: addLayer,
    };
})();
