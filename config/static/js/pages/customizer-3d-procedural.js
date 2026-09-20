import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

(() => {
    "use strict";

    // ================================================================
    // BABAei 3D STUDIO — MOBILE MODEL BASELINE v1.0.0
    // #MODEL-FIXED #MOBILE-FRAME #DO-NOT-REGRESS
    // The GLB loading + base framing is considered stable at this point.
    // Future mobile UI changes must not alter this baseline without testing.
    // ================================================================

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

    const textArtworkSvg = (text, color) => {
        const safeText = esc(text);
        const safeColor = /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : "#ffffff";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" viewBox="0 0 900 420">
            <rect width="900" height="420" fill="none"/>
            <text x="450" y="225" text-anchor="middle" dominant-baseline="middle"
                  font-family="Arial, sans-serif" font-size="118" font-weight="700"
                  fill="${safeColor}">${safeText}</text>
        </svg>`;
        return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
    };

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
    const compactMedia = window.matchMedia("(max-width: 1023px)");
    let renderFrameId = 0;

    function status(text) {
        const el = document.getElementById("save-status");
        if (el) el.textContent = text || "";
    }

    function showModelPreview() {
        const preview = data.views?.[0]?.background;
        if (!preview) return;
        stage.style.backgroundImage =
            "radial-gradient(ellipse at 50% 40%, rgba(255,255,255,.07), transparent 34%)," +
            "radial-gradient(ellipse at 50% 82%, rgba(216,182,107,.045), transparent 38%)," +
            `url("${String(preview).replace(/"/g, "\\\"")}")`;
        stage.style.backgroundPosition = "center, center, center";
        stage.style.backgroundSize = "auto, auto, min(68vw, 420px) auto";
        stage.style.backgroundRepeat = "no-repeat, no-repeat, no-repeat";
    }

    function clearModelPreview() {
        stage.style.backgroundImage = "";
        stage.style.backgroundPosition = "";
        stage.style.backgroundSize = "";
        stage.style.backgroundRepeat = "";
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

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.055;
        controls.enablePan = false;
        controls.rotateSpeed = 0.62;
        controls.zoomSpeed = 0.72;
        controls.minPolarAngle = 0.82;
        controls.maxPolarAngle = 2.32;
        controls.target.set(0, 0, 0);
        controls.addEventListener("start", scheduleRenderLoop);
        controls.addEventListener("end", scheduleRenderLoop);

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

        // The supplied shirt asset reads slightly too square on narrow
        // portrait screens. Add a restrained Y-only stretch for phones so
        // the silhouette reads like a real T-shirt without changing width.
        if (window.matchMedia("(max-width: 600px)").matches) {
            rootObject.scale.y *= 1.12;
        }

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

    function setupEnvironment() {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const environment = new RoomEnvironment();
        scene.environment = pmrem.fromScene(environment, 0.03).texture;
        scene.environmentIntensity = 0.55;
        environment.dispose();
        pmrem.dispose();
    }

    async function loadGarment() {
        if (!modelUrl) throw new Error("مدل سه‌بعدی تیشرت تعریف نشده است.");

        setLoading("در حال بارگذاری مدل سه‌بعدی…", true);
        showModelPreview();
        const loader = new GLTFLoader();

        // Start the 33MB GLB request first, then build the reflection
        // environment while the browser is receiving the asset.
        const gltfPromise = new Promise((resolve, reject) => {
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

        setupEnvironment();
        const gltf = await gltfPromise;

        
        garment = gltf.scene;
        garment.name = "BabaeiTshirtGLB";

        // Preserve the established mobile presentation angle. The full-stage
        // viewport fix must not reset the garment to a flat front view.
        garment.rotation.y = THREE.MathUtils.degToRad(-8);
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
        clearModelPreview();
        setLoading("", false);
        render();
    }


    function fitCamera(initial = false) {
        if (!camera || !controls || !garment) return;

        const mobile = compactMedia.matches;
        const aspect = Math.max(0.35, camera.aspect || 1);

        // The mobile viewport is portrait, so the horizontal FOV is much
        // narrower than the vertical FOV. The camera must therefore be fitted
        // against BOTH the garment width and height. Fitting by height alone
        // crops the shoulders/sleeves on phones.
        //
        // A wider mobile FOV lets us keep the garment visually large while the
        // two-axis fit guarantees that the complete shirt remains inside the
        // canvas.
        // Portrait screens have very little horizontal field of view. A
        // slightly tighter mobile FOV keeps the garment prominent without
        // cropping the sleeves because the fit distance is still calculated
        // from both axes below.
        const targetFov = mobile ? 39 : 28;
        if (Math.abs(camera.fov - targetFov) > 0.01) {
            camera.fov = targetFov;
        }

        const box = new THREE.Box3().setFromObject(garment);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFov = 2 * Math.atan(
            Math.tan(verticalFov / 2) * aspect
        );

        const verticalDistance =
            size.y / (2 * Math.tan(verticalFov / 2));

        const horizontalDistance =
            size.x / (2 * Math.tan(horizontalFov / 2));

        // Fit the actual bounding box on both axes. The small depth term keeps
        // the model from touching the camera when it is rotated.
        const fitDistance = Math.max(
            verticalDistance,
            horizontalDistance,
            size.z * 1.25
        );

        // Slightly tighter on mobile so the shirt is not unnecessarily small,
        // while still leaving enough safety margin around the silhouette.
        // Phone composition: keep the garment visually compact without
        // changing the model itself. The phone screenshot is a portrait
        // viewport, so a modest extra camera distance prevents the shirt from
        // looking overly wide while preserving the full silhouette.
        const distance = fitDistance * (mobile ? 1.55 : 1.06);
        baseCameraDistance = distance;

        // Standard Three.js camera framing is controlled through the
        // OrbitControls target: the point assigned to controls.target becomes
        // the center of the camera's view. For this phone editor we anchor the
        // garment at the actual viewport center, rather than leaving the model
        // in the upper half of the screen because of the fixed mobile chrome.
        const isPhone = window.matchMedia("(max-width: 600px)").matches;
        const visualCenterRatio = isPhone ? 0.665 : 0.50;
        const visualCenterShift = isPhone
            ? (visualCenterRatio - 0.50)
              * 2
              * Math.tan(verticalFov / 2)
              * distance
            : 0;

        const targetY = center.y + visualCenterShift;
        const cameraY = center.y + visualCenterShift;

        camera.position.set(0, cameraY, distance);
        controls.target.set(center.x, targetY, center.z);

        camera.near = Math.max(0.01, distance / 100);
        camera.far = Math.max(100, distance * 20);
        camera.updateProjectionMatrix();

        if (initial) controls.update();
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
        // The canvas may still have an inline height from an older responsive
        // breakpoint. Never use canvas.clientHeight as the source of truth:
        // that can lock the WebGL viewport to the old mobile height and leave
        // the lower half of the 3D stage unrendered.
        // The stage itself is the authoritative mobile viewport.
        const stageRect = stage.getBoundingClientRect();
        const width = Math.max(1, Math.round(stageRect.width));
        const height = Math.max(1, Math.round(stageRect.height));

        const mobile = compactMedia.matches;
        const pixelRatioCap = mobile ? 1.5 : 2;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        if (mobile) {
            canvas.style.position = "absolute";
            canvas.style.left = "0";
            canvas.style.right = "0";
            canvas.style.top = "0px";
            canvas.style.width = "100%";
            canvas.style.height = `${height}px`;
        } else {
            canvas.style.position = "";
            canvas.style.left = "";
            canvas.style.right = "";
            canvas.style.top = "";
            canvas.style.width = "";
            canvas.style.height = "";
        }

        if (garment) fitCamera();
        else render();
    }

    function render() {
        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    function scheduleRenderLoop() {
        if (renderFrameId || !renderer || !scene || !camera) return;
        renderFrameId = requestAnimationFrame(() => {
            renderFrameId = 0;
            if (!controls) {
                render();
                return;
            }
            const changed = controls.update();
            render();
            if (changed) scheduleRenderLoop();
        });
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

    function placementHit() {
        // The exact viewport center can occasionally fall inside the collar/hole
        // or between thin mesh parts. Try a small set of nearby points so an
        // uploaded artwork always gets a valid cloth anchor.
        const candidates = [
            [0, 0],
            [0, 0.08],
            [0, -0.08],
            [-0.08, 0],
            [0.08, 0],
            [-0.06, 0.08],
            [0.06, 0.08],
        ];
        for (const [x, y] of candidates) {
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
            const hit = raycaster.intersectObjects(garmentMeshes, false)[0];
            if (hit) return hit;
        }
        return null;
    }

    function hitNormal(hit) {
        return (hit.face?.normal?.clone() || frontAxis.clone())
            .transformDirection(hit.object.matrixWorld)
            .normalize();
    }

    function orientation(normal, rotation) {
        const n = normal.clone().normalize();

        // Build a stable surface frame instead of using setFromUnitVectors().
        // The old approach has an unavoidable roll ambiguity when the normal is
        // on the back of the shirt, so tiny normal changes while dragging could
        // make the decal visibly spin. World-up gives the front and back a stable
        // "top" direction and we only rotate around the surface normal when the
        // user explicitly changes the label rotation.
        let up = new THREE.Vector3(0, 1, 0);
        up.addScaledVector(n, -up.dot(n));

        // Near a perfectly vertical normal, world-up has no usable projection.
        // Fall back to world-Z in that rare case.
        if (up.lengthSq() < 1e-6) {
            up.set(0, 0, 1);
            up.addScaledVector(n, -up.dot(n));
        }

        up.normalize();
        const right = new THREE.Vector3().crossVectors(up, n).normalize();

        const basis = new THREE.Matrix4().makeBasis(right, up, n);
        const frame = new THREE.Quaternion().setFromRotationMatrix(basis);
        const spin = new THREE.Quaternion().setFromAxisAngle(
            n,
            THREE.MathUtils.degToRad(Number(rotation) || 0)
        );

        return new THREE.Euler().setFromQuaternion(spin.multiply(frame));
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
        if (item.handles) {
            item.handles.traverse(child => {
                child.geometry?.dispose();
                child.material?.dispose();
            });
            item.handles.parent?.remove(item.handles);
            item.handles = null;
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
                color: new THREE.Color(item.layer.color || "#ffffff"),
                transparent: true,
                opacity: Math.max(0.2, Math.min(1, Number(item.layer.opacity ?? 1))),
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
            frame.quaternion.copy(targetWorldQuaternion.clone().invert().multiply(worldQuaternion));
            frame.userData.customizerLayerId = item.id;
            frame.renderOrder = 80;
            target.add(frame);

            // Four compact handles make the selected artwork feel like a real
            // mobile design editor without adding another DOM overlay.
            const handleGroup = new THREE.Group();
            handleGroup.position.copy(targetWorldPosition);
            handleGroup.quaternion.copy(targetWorldQuaternion.clone().invert().multiply(worldQuaternion));
            handleGroup.userData.customizerLayerId = item.id;
            handleGroup.renderOrder = 81;

            const handleSize = Math.max(0.026, Math.min(size.x, size.y) * 0.045);
            const handleGeometry = new THREE.SphereGeometry(handleSize, 12, 8);
            const handleMaterial = new THREE.MeshBasicMaterial({
                color: 0xf4f0e7,
                transparent: true,
                opacity: 0.98,
                depthTest: false,
                depthWrite: false,
            });

            [
                [-size.x / 2, -size.y / 2],
                [ size.x / 2, -size.y / 2],
                [ size.x / 2,  size.y / 2],
                [-size.x / 2,  size.y / 2],
            ].forEach(([x, y]) => {
                const handle = new THREE.Mesh(handleGeometry.clone(), handleMaterial.clone());
                handle.position.set(x, y, 0);
                handle.renderOrder = 82;
                handle.userData.customizerLayerId = item.id;
                handleGroup.add(handle);
            });
            target.add(handleGroup);

            const previousMesh = item.mesh;
            const previousFrame = item.frame;
            const previousHandles = item.handles;

            item.mesh = mesh;
            item.frame = frame;
            item.handles = handleGroup;

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
            if (previousHandles) {
                previousHandles.traverse(child => {
                    child.geometry?.dispose();
                    child.material?.dispose();
                });
                previousHandles.parent?.remove(previousHandles);
            }

            render();
        }).catch(() => status("تصویر لیبل برای پیش‌نمایش بارگذاری نشد."));
    }

    document.addEventListener("babaei:add-text", event => {
        const text = String(event.detail?.text || "").trim().slice(0, 60);
        if (!text) return;

        const image = textArtworkSvg(text, "#ffffff");
        const artwork = {
            id: `text-${Date.now()}`,
            name: text,
            code: "TEXT",
            image,
            base_price: 0,
            is_text: true,
        };
        addLayer(artwork);
    });

    function addLayer(artworkOrId) {
        // Uploaded artworks are added to the legacy customizer state after
        // designer-data has already been parsed by this module. Accept the
        // fresh artwork object so newly uploaded images can be placed in 3D.
        const artwork = typeof artworkOrId === "object" && artworkOrId
            ? artworkOrId
            : artworkById(artworkOrId);
        const area = areaById(activeAreaId);
        const hit = placementHit();

        if (!artwork || !area || !hit) {
            status("ابتدا ناحیه چاپ را انتخاب کنید.");
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
            color: "#ffffff",
            opacity: 1,
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
        document.dispatchEvent(new CustomEvent("babaei:label-added"));
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

    function moveSelectedBy(dx, dy) {
        const item = layers.get(selectedId);
        if (!item?.target || !item.surfacePoint || !item.surfaceNormal) return;

        const normal = item.surfaceNormal.clone().normalize();
        const up = new THREE.Vector3(0, 1, 0).projectOnPlane(normal);
        if (up.lengthSq() < 0.0001) up.set(0, 0, 1);
        up.normalize();

        const right = new THREE.Vector3().crossVectors(up, normal).normalize();
        const step = Math.max(0.012, (item.size?.x || 0.35) * 0.08);
        const candidate = item.surfacePoint.clone()
            .addScaledVector(right, dx * step)
            .addScaledVector(up, dy * step);

        const origin = candidate.clone().addScaledVector(normal, 0.45);
        const direction = normal.clone().multiplyScalar(-1);
        const probe = new THREE.Raycaster(origin, direction, 0, 0.9);
        const hit = probe.intersectObject(item.target, false)[0];
        if (!hit) return;

        item.target = hit.object;
        project(item, hit.point, hitNormal(hit));
    }

    function renderAreas() {
        const host = document.getElementById("area-list");
        if (!host) return;

        if (!activeAreaId) activeAreaId = areas[0]?.id || null;

        host.innerHTML = areas.map(area => {
            return `<button type="button" class="area-option ${Number(area.id) === Number(activeAreaId) ? "is-active" : ""}" data-area-id="${area.id}">
                <span>${esc(area.name)}</span>
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
        document.dispatchEvent(new CustomEvent("babaei:selection-changed", { detail: { selected: Boolean(selected), id: selectedId } }));
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
            const visible = item.id === selectedId;
            if (item.frame) item.frame.visible = visible;
            if (item.handles) item.handles.visible = visible;
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
                ? `<div class="premium-selected-artwork__name">لیبل انتخاب‌شده: <strong>${esc(selected.artwork.name || "لیبل")}</strong></div><div class="premium-selected-artwork__code">${esc(selected.artwork.code || "LBL")}</div><div class="premium-selected-artwork__hint">برای جابه‌جایی، مستقیم روی تیشرت بکش.</div>`
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
            color: item.layer.color || "#ffffff",
            opacity: Number(item.layer.opacity ?? 1),
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

        document.querySelectorAll("[data-action]").forEach(button => {
            button.addEventListener("click", () => {
                const item = layers.get(selectedId);
                if (!item) return;

                const action = button.dataset.action;

                if (action === "move-left") {
                    moveSelectedBy(-1, 0);
                } else if (action === "move-right") {
                    moveSelectedBy(1, 0);
                } else if (action === "move-up") {
                    moveSelectedBy(0, 1);
                } else if (action === "move-down") {
                    moveSelectedBy(0, -1);
                } else if (action === "scale-up" || action === "scale-down") {
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

        document.addEventListener("babaei:set-layer-color", event => {
            const item = layers.get(selectedId);
            const color = String(event.detail?.color || "").trim();
            if (!item || !/^#[0-9a-f]{6}$/i.test(color)) return;

            item.layer.color = color;
            if (item.artwork?.is_text || item.artwork?.code === "TEXT") {
                item.artwork.image = textArtworkSvg(item.artwork.name || "TEXT", color);
                project(item, item.surfacePoint || item.position, item.surfaceNormal || item.normal);
            } else if (item.mesh?.material?.color) {
                item.mesh.material.color.set(color);
                item.mesh.material.needsUpdate = true;
            }
            render();
        });

        document.addEventListener("babaei:set-layer-opacity", event => {
            const item = layers.get(selectedId);
            if (!item) return;

            const opacity = Math.max(0.2, Math.min(1, Number(event.detail?.opacity ?? 1)));
            item.layer.opacity = opacity;
            if (item.mesh?.material) {
                item.mesh.material.opacity = opacity;
                item.mesh.material.needsUpdate = true;
            }
            render();
        });

        document.addEventListener("babaei:deselect-label", () => {
            selectedId = null;
            sync();
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

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(stage);
    window.addEventListener("orientationchange", resize, { passive: true });
    compactMedia.addEventListener?.("change", resize);

    window.addEventListener("pagehide", () => {
        if (renderFrameId) cancelAnimationFrame(renderFrameId);
        resizeObserver.disconnect();
        controls?.dispose();
        renderer?.dispose();
    }, { once: true });

    window.BabaeiCustomizer3D = {
        getPayload: saveLayers,
        isReady: () => Boolean(garment && garmentMeshes.length),
        setMode: mode => document.querySelector(`[data-mode="${mode}"]`)?.click(),
        addArtwork: addLayer,
    };
})();