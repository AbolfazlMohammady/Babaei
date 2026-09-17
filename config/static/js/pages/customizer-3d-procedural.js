import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

(() => {
    "use strict";

    const root = document.getElementById("customizer");
    const stage = document.getElementById("designer-3d-stage");
    const canvas = document.getElementById("designer-3d-canvas");
    if (!root || !stage || !canvas) return;

    let data = {};
    try { data = JSON.parse(document.getElementById("designer-data")?.textContent || "{}"); }
    catch (error) { console.error("Invalid designer data", error); return; }

    const artworks = data.artworks || [];
    const variants = data.variants || [];
    const prices = data.prices || {};
    const areas = (data.views || []).flatMap(view => view.areas || []);
    const basePrice = Number(data.base_price || 0);
    const artworkById = id => artworks.find(item => Number(item.id) === Number(id));
    const areaById = id => areas.find(item => Number(item.id) === Number(id));
    const esc = value => String(value ?? "").replace(/[&<>\"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
    const money = value => Number(value || 0).toLocaleString("fa-IR");

    let scene, camera, renderer, controls, shirt;
    let shirtMaterials = [];
    let shirtMeshes = [];
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

    function status(text) {
        const el = document.getElementById("save-status");
        if (el) el.textContent = text || "";
    }

    function csrf() {
        const token = document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith("csrftoken="));
        return token ? decodeURIComponent(token.slice(10)) : "";
    }

    function fabric(color = 0xffffff, roughness = 0.82) {
        return new THREE.MeshPhysicalMaterial({
            color,
            roughness,
            metalness: 0,
            clearcoat: 0.06,
            clearcoatRoughness: 0.82,
            envMapIntensity: 0.72,
        });
    }

    function createBodySurface() {
        const rows = 30;
        const cols = 30;
        const positions = [];
        const uvs = [];
        const indices = [];

        const point = (ix, iy, back = false) => {
            const u = ix / cols * 2 - 1;
            const v = iy / rows * 2 - 1;
            const y = v * 1.58;
            const shoulder = Math.max(0, (v - 0.48) / 0.52);
            const lower = Math.max(0, (-v - 0.28) / 0.72);
            const width = 0.90 + 0.15 * (1 - Math.abs(v)) + 0.10 * shoulder - 0.045 * lower;
            const x = u * width;
            const chest = Math.max(0, 1 - u * u);
            const belly = Math.max(0, 1 - Math.abs(v));
            const zBase = 0.12 + 0.075 * chest * belly + 0.018 * Math.cos(v * Math.PI);
            const z = (back ? -1 : 1) * zBase;
            return [x, y, z];
        };

        for (let iy = 0; iy <= rows; iy += 1) {
            for (let ix = 0; ix <= cols; ix += 1) {
                const p = point(ix, iy, false);
                positions.push(...p);
                uvs.push(ix / cols, 1 - iy / rows);
            }
        }
        const frontCount = (rows + 1) * (cols + 1);
        for (let iy = 0; iy <= rows; iy += 1) {
            for (let ix = 0; ix <= cols; ix += 1) {
                const p = point(ix, iy, true);
                positions.push(...p);
                uvs.push(1 - ix / cols, 1 - iy / rows);
            }
        }

        const addGrid = offset => {
            for (let iy = 0; iy < rows; iy += 1) {
                for (let ix = 0; ix < cols; ix += 1) {
                    const a = offset + iy * (cols + 1) + ix;
                    const b = a + 1;
                    const c = a + cols + 1;
                    const d = c + 1;
                    indices.push(a, c, b, b, c, d);
                }
            }
        };
        addGrid(0);
        addGrid(frontCount);

        // Close the side seam with small quads so the shirt is a real volume.
        const edge = (left, iy) => (iy * (cols + 1) + (left ? 0 : cols));
        for (let iy = 0; iy < rows; iy += 1) {
            for (const left of [true, false]) {
                const a = edge(left, iy);
                const b = edge(left, iy + 1);
                const c = frontCount + edge(left, iy);
                const d = frontCount + edge(left, iy + 1);
                indices.push(a, b, c, c, b, d);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }

    function sleeveGeometry(side) {
        const geometry = new THREE.CapsuleGeometry(0.29, 0.58, 12, 32);
        geometry.scale(1.0, 1.0, 0.76);
        geometry.rotateZ(Math.PI / 2);
        geometry.rotateY(side * -0.18);
        return geometry;
    }

    function makeSleeve(group, side) {
        const sleeve = new THREE.Mesh(sleeveGeometry(side), fabric());
        sleeve.position.set(side * 1.08, 0.83, 0.0);
        sleeve.rotation.z = side * -0.10;
        sleeve.castShadow = true;
        sleeve.receiveShadow = true;
        sleeve.name = side < 0 ? "LeftSleeve" : "RightSleeve";
        group.add(sleeve);
        shirtMeshes.push(sleeve);
        shirtMaterials.push(sleeve.material);

        const cuff = new THREE.Mesh(
            new THREE.TorusGeometry(0.285, 0.028, 10, 40),
            fabric(0xf4f2ed, 0.9)
        );
        cuff.rotation.y = Math.PI / 2;
        cuff.position.set(side * 1.35, 0.73, 0);
        cuff.scale.set(1, 0.90, 0.76);
        cuff.castShadow = true;
        cuff.name = side < 0 ? "LeftCuff" : "RightCuff";
        group.add(cuff);
        shirtMeshes.push(cuff);
        shirtMaterials.push(cuff.material);
    }

    function makeShirt() {
        const group = new THREE.Group();
        group.name = "BabaeiTshirtV2";

        const body = new THREE.Mesh(createBodySurface(), fabric(0xffffff, 0.84));
        body.castShadow = true;
        body.receiveShadow = true;
        body.name = "TshirtBodySurface";
        group.add(body);
        shirtMeshes.push(body);
        shirtMaterials.push(body.material);

        makeSleeve(group, -1);
        makeSleeve(group, 1);

        const collar = new THREE.Mesh(
            new THREE.TorusGeometry(0.38, 0.055, 14, 64),
            fabric(0xf4f2ed, 0.88)
        );
        collar.scale.set(1.08, 0.78, 1);
        collar.position.set(0, 1.30, 0.14);
        collar.rotation.x = Math.PI / 2;
        collar.name = "CrewNeckRib";
        group.add(collar);
        shirtMaterials.push(collar.material);

        const innerNeck = new THREE.Mesh(
            new THREE.TorusGeometry(0.315, 0.032, 10, 64),
            fabric(0xdedbd4, 0.94)
        );
        innerNeck.scale.set(1.08, 0.78, 1);
        innerNeck.position.set(0, 1.30, 0.145);
        innerNeck.rotation.x = Math.PI / 2;
        group.add(innerNeck);
        shirtMaterials.push(innerNeck.material);

        const hem = new THREE.Mesh(
            new THREE.TorusGeometry(0.83, 0.032, 8, 64),
            fabric(0xf2f0eb, 0.90)
        );
        hem.scale.set(1, 1.9, 0.9);
        hem.rotation.x = Math.PI / 2;
        hem.position.set(0, -1.58, 0.01);
        hem.name = "BottomHem";
        group.add(hem);
        shirtMaterials.push(hem.material);

        return group;
    }

    function setupScene() {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
        camera.position.set(0, 0.02, 4.85);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.04;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const pmrem = new THREE.PMREMGenerator(renderer);
        const environment = new RoomEnvironment();
        scene.environment = pmrem.fromScene(environment, 0.03).texture;
        scene.environmentIntensity = 0.48;
        environment.dispose();
        pmrem.dispose();

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.055;
        controls.enablePan = false;
        controls.rotateSpeed = 0.62;
        controls.zoomSpeed = 0.72;
        controls.minPolarAngle = 1.05;
        controls.maxPolarAngle = 2.18;
        controls.minDistance = 3.15;
        controls.maxDistance = 6.2;
        controls.target.set(0, 0, 0);
        controls.addEventListener("change", render);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x191919, 1.20));
        const key = new THREE.DirectionalLight(0xffffff, 3.0);
        key.position.set(3.2, 4.8, 5.0);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xe4ebff, 1.15);
        fill.position.set(-4, 2.5, 2.5);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffdfb2, 1.25);
        rim.position.set(2.5, 3.0, -4.0);
        scene.add(rim);

        shirt = makeShirt();
        shirt.position.y = 0.02;
        scene.add(shirt);
        fitCamera();
        resize();
    }

    function fitCamera() {
        const box = new THREE.Box3().setFromObject(shirt);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        shirt.position.sub(center);
        shirt.position.y += 0.02;
        const maxSize = Math.max(size.x, size.y, size.z);
        const distance = (maxSize * 0.57) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        camera.position.set(0, 0.02, Math.max(4.0, distance * 0.96));
        camera.near = 0.01;
        camera.far = 100;
        controls.target.set(0, 0, 0);
        controls.minDistance = Math.max(3.0, maxSize * 0.72);
        controls.maxDistance = Math.max(6.5, maxSize * 1.8);
        camera.updateProjectionMatrix();
    }

    function resize() {
        if (!renderer) return;
        const width = Math.max(1, stage.clientWidth);
        const height = Math.max(1, stage.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
    }

    function render() {
        if (renderer) renderer.render(scene, camera);
    }

    function setColor(hex) {
        const base = new THREE.Color(hex || "#ffffff");
        shirtMaterials.forEach(material => {
            if (!material?.color) return;
            const color = base.clone();
            if (material === shirtMaterials[0]) color.multiplyScalar(0.98);
            else color.lerp(new THREE.Color(0xffffff), 0.08);
            material.color.copy(color);
            material.needsUpdate = true;
        });
        render();
    }

    function loadTexture(url) {
        if (textures.has(url)) return textures.get(url);
        const promise = new THREE.TextureLoader().loadAsync(url).then(texture => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
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

    function hits(event, includeDecals = false) {
        pointerOf(event);
        raycaster.setFromCamera(pointer, camera);
        const targets = includeDecals
            ? [shirt, ...Array.from(layers.values()).map(item => item.mesh).filter(Boolean)]
            : shirtMeshes;
        return raycaster.intersectObjects(targets, true);
    }

    function centerHit() {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        return raycaster.intersectObjects(shirtMeshes, true)[0] || null;
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
        item.mesh.material?.dispose();
        scene.remove(item.mesh);
        item.mesh = null;
    }

    function project(item, point, normal) {
        if (!item.artwork?.image) return;
        loadTexture(item.artwork.image).then(texture => {
            if (!layers.has(item.id)) return;
            disposeLayer(item);
            item.position = point.clone();
            item.normal = normal.clone().normalize();

            const aspect = Math.max(0.15, (texture.image?.width || 1) / Math.max(1, texture.image?.height || 1));
            const width = Math.max(0.10, Math.min(0.78, 0.68 * Number(item.layer.width || 0.35)));
            const size = new THREE.Vector3(width, width / aspect, Math.max(0.018, width * 0.045));
            item.size = size;

            const target = item.target || shirtMeshes[0];
            if (!target) return;
            const geometry = new DecalGeometry(target, item.position, orientation(item.normal, item.layer.rotation), size);
            const material = new THREE.MeshPhysicalMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.025,
                roughness: 0.68,
                metalness: 0,
                clearcoat: 0.02,
                depthTest: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -5,
                polygonOffsetUnits: -2,
                side: THREE.DoubleSide,
            });
            material.emissive = new THREE.Color(item.id === selectedId ? 0x332712 : 0x000000);
            material.emissiveIntensity = item.id === selectedId ? 0.10 : 0;

            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 30 + Number(item.layer.z_index || 0);
            mesh.userData.customizerLayerId = item.id;
            scene.add(mesh);
            item.mesh = mesh;
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
        const count = Array.from(layers.values()).filter(item => Number(item.layer.area_id) === Number(area.id)).length;
        const max = Number(area.max_layers || 3);
        if (count >= max) {
            status(`در «${area.name}» بیشتر از ${max} لیبل مجاز نیست.`);
            return;
        }
        const layer = { id: nextId++, artwork_id: artwork.id, area_id: area.id, x: 0.5, y: 0.5, width: 0.35, height: 0.25, rotation: 0, z_index: layers.size };
        const item = { id: layer.id, layer, artwork, target: hit.object, position: hit.point.clone(), normal: hitNormal(hit), mesh: null, size: null };
        layers.set(item.id, item);
        selectedId = item.id;
        project(item, item.position, item.normal);
        sync();
    }

    function moveSelected(event) {
        const item = layers.get(selectedId);
        const hit = hits(event)[0];
        if (!item || !hit) return;
        item.target = hit.object;
        project(item, hit.point, hitNormal(hit));
    }

    function renderAreas() {
        const host = document.getElementById("area-list");
        if (!host) return;
        if (!activeAreaId) activeAreaId = areas[0]?.id || null;
        host.innerHTML = areas.map(area => {
            const count = Array.from(layers.values()).filter(item => Number(item.layer.area_id) === Number(area.id)).length;
            return `<button type="button" class="area-option ${Number(area.id) === Number(activeAreaId) ? "is-active" : ""}" data-area-id="${area.id}"><span>${esc(area.name)}</span><small>${count}/${Number(area.max_layers || 3)}</small></button>`;
        }).join("");
        host.querySelectorAll(".area-option").forEach(button => {
            button.addEventListener("click", () => { activeAreaId = Number(button.dataset.areaId); sync(); });
        });
    }

    function renderColors() {
        const host = document.getElementById("variant-color-list");
        if (!host) return;
        const seen = new Set();
        host.innerHTML = variants.filter(variant => {
            if (seen.has(variant.color)) return false;
            seen.add(variant.color);
            return true;
        }).map(variant => `<button type="button" class="premium-color-button" style="--swatch:${variant.hex || "#ffffff"}" data-color="${esc(variant.color)}" title="${esc(variant.color)}" aria-label="${esc(variant.color)}"></button>`).join("");
        host.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
            currentVariant = variants.find(variant => variant.color === button.dataset.color && Number(variant.stock) > 0) || variants.find(variant => variant.color === button.dataset.color);
            const select = document.getElementById("variant-select");
            if (select && currentVariant) select.value = currentVariant.id;
            host.querySelectorAll("button").forEach(item => item.classList.toggle("is-active", item === button));
            setColor(currentVariant?.hex || "#ffffff");
            sync();
        }));
    }

    function sync() {
        const selected = layers.get(selectedId);
        const card = document.getElementById("selected-card");
        const controls = document.getElementById("selected-controls");
        const chosen = document.getElementById("premium-selected-artwork");
        if (card) card.innerHTML = selected
            ? `<div class="selected-card__title">${esc(selected.artwork.name || "لیبل")}</div><span class="selected-card__meta">${esc(areaById(selected.layer.area_id)?.name || "ناحیه چاپ")} · ${Math.round(selected.layer.width * 100)}%</span>`
            : `<span class="selected-card__empty">یک لیبل را انتخاب کنید.</span>`;
        if (controls) controls.hidden = !selected;
        if (chosen) chosen.innerHTML = selected
            ? `<div class="premium-selected-artwork__name">لیبل انتخاب‌شده: <strong>${esc(selected.artwork.name || "لیبل")}</strong></div><div class="premium-selected-artwork__hint">برای جابه‌جایی، مستقیم روی تیشرت بکش.</div>`
            : "";

        let total = currentVariant ? Number(currentVariant.price) : basePrice;
        const lines = [`<div class="price-line"><span>تیشرت</span><strong>${money(total)} تومان</strong></div>`];
        layers.forEach(item => {
            const key = `${item.layer.artwork_id}:${item.layer.area_id}`;
            const price = Object.prototype.hasOwnProperty.call(prices, key) ? Number(prices[key]) : Number(item.artwork.base_price || 0);
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
                mode: "procedural_tshirt_surface_decal",
                template: "babaei_tshirt_v2",
            },
        }));
    }

    function bind() {
        canvas.addEventListener("pointerdown", event => {
            const intersections = hits(event, true);
            const decal = intersections.find(hit => hit.object?.userData?.customizerLayerId != null);
            if (decal) {
                selectedId = Number(decal.object.userData.customizerLayerId);
                drag = { pointerId: event.pointerId };
                controls.enabled = false;
                canvas.setPointerCapture(event.pointerId);
                sync();
                return;
            }
            if (event.button === 1 || event.altKey) return;
            if (selectedId != null && hits(event)[0]) {
                drag = { pointerId: event.pointerId };
                controls.enabled = false;
                canvas.setPointerCapture(event.pointerId);
                moveSelected(event);
            }
        });

        canvas.addEventListener("pointermove", event => {
            if (drag?.pointerId === event.pointerId) moveSelected(event);
        });
        ["pointerup", "pointercancel"].forEach(type => canvas.addEventListener(type, event => {
            if (drag?.pointerId !== event.pointerId) return;
            drag = null;
            controls.enabled = true;
            canvas.releasePointerCapture?.(event.pointerId);
            sync();
        }));

        document.getElementById("artwork-grid")?.addEventListener("click", event => {
            const card = event.target.closest(".artwork-card");
            if (card) addLayer(Number(card.dataset.artworkId));
        });

        document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
            const item = layers.get(selectedId);
            if (!item) return;
            const action = button.dataset.action;
            if (action === "scale-up" || action === "scale-down") {
                const factor = action === "scale-up" ? 1.06 : 0.94;
                item.layer.width = Math.min(0.78, Math.max(0.06, item.layer.width * factor));
                item.layer.height = Math.min(0.78, Math.max(0.04, item.layer.height * factor));
                project(item, item.position, item.normal);
            } else if (action === "rotate-left" || action === "rotate-right") {
                item.layer.rotation = Math.max(-180, Math.min(180, item.layer.rotation + (action === "rotate-left" ? -5 : 5)));
                project(item, item.position, item.normal);
            } else if (action === "delete") {
                disposeLayer(item);
                layers.delete(selectedId);
                selectedId = null;
            }
            sync();
            render();
        }));

        document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
            const is3d = button.dataset.mode === "3d";
            document.getElementById("designer-2d-stage")?.classList.toggle("is-hidden", is3d);
            stage.classList.toggle("is-hidden", !is3d);
            document.querySelectorAll("[data-mode]").forEach(item => item.classList.toggle("is-active", item === button));
            if (is3d) resize();
        }));

        document.getElementById("variant-select")?.addEventListener("change", event => {
            currentVariant = variants.find(variant => String(variant.id) === String(event.target.value)) || null;
            setColor(currentVariant?.hex || "#ffffff");
            sync();
        });

        document.getElementById("designer-3d-rotation")?.addEventListener("input", event => {
            shirt.rotation.y = THREE.MathUtils.degToRad(Number(event.target.value));
            render();
        });
        document.getElementById("designer-3d-reset")?.addEventListener("click", () => {
            shirt.rotation.y = 0;
            controls.reset();
            const slider = document.getElementById("designer-3d-rotation");
            if (slider) slider.value = "0";
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
                        version: 2,
                        preview_mode: "3d_procedural_tshirt",
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

    renderColors();
    currentVariant = variants.find(variant => Number(variant.stock) > 0) || variants[0] || null;
    const variantSelect = document.getElementById("variant-select");
    if (variantSelect && currentVariant) variantSelect.value = currentVariant.id;
    renderAreas();
    setupScene();
    setColor(currentVariant?.hex || "#ffffff");
    bind();
    sync();

    document.getElementById("designer-3d-progress")?.classList.add("is-hidden");
    document.getElementById("designer-3d-loading")?.classList.add("is-hidden");

    function animate() {
        requestAnimationFrame(animate);
        controls?.update();
        renderer?.render(scene, camera);
    }
    animate();
    window.addEventListener("resize", resize);

    window.BabaeiCustomizer3D = {
        getPayload: saveLayers,
        isReady: () => Boolean(shirt && shirtMeshes.length),
        setMode: mode => document.querySelector(`[data-mode="${mode}"]`)?.click(),
        addArtwork: addLayer,
    };
})();
