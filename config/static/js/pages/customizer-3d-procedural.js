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
    const areas = (data.views || []).flatMap(v => v.areas || []).length
        ? (data.views || []).flatMap(v => v.areas || [])
        : (data.print_areas || []);
    const basePrice = Number(data.base_price || 0);
    const artworkById = id => artworks.find(a => Number(a.id) === Number(id));
    const areaById = id => areas.find(a => Number(a.id) === Number(id));
    const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
    const money = value => Number(value || 0).toLocaleString("fa-IR");

    let scene, camera, renderer, controls, shirt;
    let shirtMaterials = [];
    let currentVariant = null;
    let selectedId = null;
    let activeAreaId = areas[0]?.id || null;
    let nextId = 1;
    let drag = null;
    let rotation = 0;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const layers = new Map();
    const meshes = [];
    const textures = new Map();
    const zAxis = new THREE.Vector3(0, 0, 1);

    function status(text) { const el = document.getElementById("save-status"); if (el) el.textContent = text || ""; }
    function csrf() { const m = document.cookie.split(";").map(x => x.trim()).find(x => x.startsWith("csrftoken=")); return m ? decodeURIComponent(m.slice(10)) : ""; }

    function fabricMaterial(color = 0xffffff, roughness = .72) {
        return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: .08, clearcoatRoughness: .7, envMapIntensity: 1.15 });
    }

    function bodyGeometry() {
        const s = new THREE.Shape();
        s.moveTo(-.88,1.42); s.lineTo(-1.32,1.13); s.lineTo(-1.66,.86); s.quadraticCurveTo(-1.72,.80,-1.68,.70);
        s.lineTo(-1.48,.15); s.quadraticCurveTo(-1.44,.06,-1.35,.10); s.lineTo(-1.07,.20); s.lineTo(-.99,-1.50);
        s.quadraticCurveTo(-.98,-1.62,-.82,-1.65); s.lineTo(.82,-1.65); s.quadraticCurveTo(.98,-1.62,.99,-1.50);
        s.lineTo(1.07,.20); s.lineTo(1.35,.10); s.quadraticCurveTo(1.44,.06,1.48,.15); s.lineTo(1.68,.70);
        s.quadraticCurveTo(1.72,.80,1.66,.86); s.lineTo(1.32,1.13); s.lineTo(.88,1.42);
        s.quadraticCurveTo(.62,1.53,.40,1.47); s.quadraticCurveTo(.20,1.42,0,1.28); s.quadraticCurveTo(-.20,1.42,-.40,1.47); s.quadraticCurveTo(-.62,1.53,-.88,1.42);
        const g = new THREE.ExtrudeGeometry(s, { depth:.44, bevelEnabled:true, bevelSegments:5, steps:3, bevelSize:.065, bevelThickness:.06, curveSegments:8 });
        g.translate(0,0,-.22); g.computeVertexNormals(); return g;
    }

    function addSleeve(group, side) {
        const mat = fabricMaterial();
        const g = new THREE.CapsuleGeometry(.34,.68,8,24);
        g.scale(1,.92,.74); g.rotateZ(Math.PI/2); g.rotateY(side * .08);
        const sleeve = new THREE.Mesh(g, mat);
        sleeve.position.set(side*1.37,.72,0); sleeve.castShadow = sleeve.receiveShadow = true; sleeve.name = side < 0 ? "LeftSleeve" : "RightSleeve";
        group.add(sleeve); meshes.push(sleeve); shirtMaterials.push(mat);
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(.345,.032,8,32), fabricMaterial(0xf0eeea,.8));
        cuff.geometry.rotateY(Math.PI/2); cuff.position.set(side*1.70,.70,0); cuff.scale.set(1,.94,.78); group.add(cuff); shirtMaterials.push(cuff.material);
    }

    function makeShirt() {
        const g = new THREE.Group(); g.name = "BabaeiTshirtV1";
        const bodyMat = fabricMaterial();
        const body = new THREE.Mesh(bodyGeometry(), bodyMat);
        body.castShadow = body.receiveShadow = true; body.name = "ShirtBody"; g.add(body); meshes.push(body); shirtMaterials.push(bodyMat);
        addSleeve(g,-1); addSleeve(g,1);

        const collar = new THREE.Mesh(new THREE.TorusGeometry(.39,.055,12,64), fabricMaterial(0xf0eeea,.67));
        collar.scale.set(1.08,.78,1); collar.position.set(0,1.20,.255); g.add(collar); shirtMaterials.push(collar.material);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(.345,.345,.075,48), fabricMaterial(0x77736d,.95));
        neck.rotation.x=Math.PI/2; neck.scale.set(1.05,.76,1); neck.position.set(0,1.20,.21); g.add(neck);
        const hem = new THREE.Mesh(new THREE.BoxGeometry(1.62,.075,.48,32,3,8), fabricMaterial(0xf0eeea,.8));
        hem.position.set(0,-1.60,0); hem.name="BottomHem"; g.add(hem); meshes.push(hem); shirtMaterials.push(hem.material);
        return g;
    }

    function setupScene() {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(31,1,.01,100); camera.position.set(0,.05,4.8);
        renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"high-performance"});
        renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
        renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        const pmrem=new THREE.PMREMGenerator(renderer), env=new RoomEnvironment(); scene.environment=pmrem.fromScene(env,.035).texture; scene.environmentIntensity=.72; env.dispose(); pmrem.dispose();
        controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.065; controls.enablePan=false; controls.rotateSpeed=.68; controls.zoomSpeed=.8; controls.minPolarAngle=.65; controls.maxPolarAngle=2.45; controls.minDistance=2.8; controls.maxDistance=7.2; controls.target.set(0,0,0); controls.addEventListener("change",render);
        scene.add(new THREE.HemisphereLight(0xffffff,0x29241e,1.55));
        const key=new THREE.DirectionalLight(0xffffff,4.3); key.position.set(3.5,5.5,5); key.castShadow=true; key.shadow.mapSize.set(1536,1536); scene.add(key);
        const fill=new THREE.DirectionalLight(0xdbe6ff,1.7); fill.position.set(-4,2.5,2); scene.add(fill);
        const rim=new THREE.DirectionalLight(0xffd7a4,2.0); rim.position.set(2.5,3,-4); scene.add(rim);
        shirt=makeShirt(); shirt.position.y=.02; scene.add(shirt);
        fit(); resize();
    }

    function fit() {
        const box=new THREE.Box3().setFromObject(shirt), c=box.getCenter(new THREE.Vector3()), s=box.getSize(new THREE.Vector3());
        shirt.position.sub(c); shirt.position.y+=.05; const max=Math.max(s.x,s.y,s.z); camera.position.set(0,.08,Math.max(4,max*1.42)); controls.target.set(0,0,0); controls.minDistance=Math.max(2.8,max*.95); controls.maxDistance=Math.max(7,max*2.3); camera.updateProjectionMatrix();
    }
    function resize(){ if(!renderer)return; const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight); renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); render(); }
    function render(){ if(renderer) renderer.render(scene,camera); }

    function setColor(hex){ const c=new THREE.Color(hex||"#fff"); shirtMaterials.forEach((m,i)=>m.color?.copy(i?c.clone().lerp(new THREE.Color(0xffffff),.10):c)); render(); }
    function texture(url){ if(textures.has(url))return textures.get(url); const p=new THREE.TextureLoader().loadAsync(url).then(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;}); textures.set(url,p); return p; }
    function pointerOf(e){const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;}
    function hits(e,decals=false){pointerOf(e);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(decals?[shirt,...[...layers.values()].map(x=>x.mesh).filter(Boolean)]:meshes,true);}
    function centerHit(){raycaster.setFromCamera(new THREE.Vector2(0,0),camera);return raycaster.intersectObjects(meshes,true)[0];}
    function normal(hit){return (hit.face?.normal?.clone()||new THREE.Vector3(0,0,1)).transformDirection(hit.object.matrixWorld).normalize();}
    function orient(n,deg){const a=new THREE.Quaternion().setFromUnitVectors(zAxis,n),s=new THREE.Quaternion().setFromAxisAngle(n,THREE.MathUtils.degToRad(deg));return new THREE.Euler().setFromQuaternion(s.multiply(a));}
    function dispose(item){if(!item?.mesh)return;item.mesh.geometry.dispose();item.mesh.material.dispose();scene.remove(item.mesh);item.mesh=null;}

    function project(item,point,n){
        if(!item.artwork?.image)return;
        texture(item.artwork.image).then(t=>{
            if(!layers.has(item.id))return; dispose(item); item.position=point.clone(); item.normal=n.clone();
            const aspect=Math.max(.15,(t.image?.width||1)/(t.image?.height||1)),w=Math.max(.05,.90*Number(item.layer.width||.35));
            const size=new THREE.Vector3(w,w/aspect,Math.max(.008,w*.035)); item.size=size;
            const target=item.target||meshes[0]; if(!target)return;
            const geo=new DecalGeometry(target,item.position,orient(item.normal,item.layer.rotation),size);
            const mat=new THREE.MeshPhysicalMaterial({map:t,transparent:true,alphaTest:.02,roughness:.62,metalness:0,clearcoat:.04,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-2,side:THREE.DoubleSide});
            mat.emissive=new THREE.Color(item.id===selectedId?0x332712:0);mat.emissiveIntensity=item.id===selectedId?.1:0;
            const mesh=new THREE.Mesh(geo,mat);mesh.renderOrder=30+Number(item.layer.z_index||0);mesh.userData.customizerLayerId=item.id;scene.add(mesh);item.mesh=mesh;render();
        }).catch(()=>status("تصویر لیبل برای پیش‌نمایش بارگذاری نشد."));
    }

    function addLayer(id){
        const art=artworkById(id),area=areaById(activeAreaId),hit=centerHit(); if(!art||!area||!hit){status("ابتدا یک ناحیه چاپ انتخاب کنید.");return;}
        const count=[...layers.values()].filter(x=>Number(x.layer.area_id)===Number(area.id)).length,max=Number(area.max_layers||3); if(count>=max){status(`در «${area.name}» بیشتر از ${max} لیبل مجاز نیست.`);return;}
        const layer={id:nextId++,artwork_id:art.id,area_id:area.id,x:.5,y:.5,width:.35,height:.25,rotation:0,z_index:layers.size};
        const item={id:layer.id,layer,art,artwork:art,target:hit.object,position:hit.point.clone(),normal:normal(hit),mesh:null,size:null};layers.set(item.id,item);selectedId=item.id;project(item,item.position,item.normal);sync();
    }

    function sync(){
        const selected=layers.get(selectedId),card=document.getElementById("selected-card"),controlsEl=document.getElementById("selected-controls"),chosen=document.getElementById("premium-selected-artwork");
        if(card)card.innerHTML=selected?`<div class="selected-card__title">${esc(selected.art.name||"لیبل")}</div><span class="selected-card__meta">${esc(areaById(selected.layer.area_id)?.name||"ناحیه چاپ")} · ${Math.round(selected.layer.width*100)}%</span>`:'<span class="selected-card__empty">یک لیبل را انتخاب کنید.</span>';
        if(controlsEl)controlsEl.hidden=!selected;
        if(chosen)chosen.innerHTML=selected?`<div class="premium-selected-artwork__name">لیبل انتخاب‌شده: <strong>${esc(selected.art.name||"لیبل")}</strong></div><div class="premium-selected-artwork__hint">برای جابه‌جایی، مستقیماً روی لیبل بکش.</div>`:"";
        let total=currentVariant?Number(currentVariant.price):basePrice; const lines=[`<div class="price-line"><span>تیشرت</span><strong>${money(total)} تومان</strong></div>`];
        layers.forEach(x=>{const p=Object.prototype.hasOwnProperty.call(prices,`${x.layer.artwork_id}:${x.layer.area_id}`)?Number(prices[`${x.layer.artwork_id}:${x.layer.area_id}`]):Number(x.art.base_price||0);total+=p;lines.push(`<div class="price-line"><span>${esc(x.art.name||"لیبل")}</span><strong>+ ${money(p)}</strong></div>`);});
        document.getElementById("price-breakdown")?.replaceChildren();const b=document.getElementById("price-breakdown");if(b)b.innerHTML=lines.join("");const t=document.getElementById("designer-total");if(t)t.textContent=money(total);
        renderAreas();
    }

    function renderAreas(){const host=document.getElementById("area-list");if(!host)return;if(!activeAreaId)activeAreaId=areas[0]?.id||null;host.innerHTML=areas.map(a=>{const n=[...layers.values()].filter(x=>Number(x.layer.area_id)===Number(a.id)).length;return `<button type="button" class="area-option ${Number(a.id)===Number(activeAreaId)?"is-active":""}" data-area-id="${a.id}"><span>${esc(a.name)}</span><small>${n}/${Number(a.max_layers||3)}</small></button>`;}).join("");host.querySelectorAll(".area-option").forEach(b=>b.onclick=()=>{activeAreaId=Number(b.dataset.areaId);sync();});}
    function renderColors(){const host=document.getElementById("variant-color-list");if(!host)return;const seen=new Set();host.innerHTML=variants.filter(v=>!seen.has(v.color)&&(seen.add(v.color),true)).map(v=>`<button type="button" class="premium-color-button" style="--swatch:${v.hex||"#fff"}" data-color="${esc(v.color)}" title="${esc(v.color)}" aria-label="${esc(v.color)}"></button>`).join("");host.querySelectorAll("button").forEach(b=>b.onclick=()=>{currentVariant=variants.find(v=>v.color===b.dataset.color&&Number(v.stock)>0)||variants.find(v=>v.color===b.dataset.color);const s=document.getElementById("variant-select");if(s&&currentVariant)s.value=currentVariant.id;setColor(currentVariant?.hex);host.querySelectorAll("button").forEach(x=>x.classList.toggle("is-active",x===b));sync();});}

    function bind(){
        canvas.addEventListener("pointerdown",e=>{const xs=hits(e,true),decal=xs.find(x=>x.object?.userData?.customizerLayerId!=null);if(decal){selectedId=decal.object.userData.customizerLayerId;drag={pointerId:e.pointerId};controls.enabled=false;canvas.setPointerCapture(e.pointerId);sync();return;}if(e.button===1||e.altKey)return;if(selectedId!=null&&hits(e)[0]){drag={pointerId:e.pointerId};controls.enabled=false;canvas.setPointerCapture(e.pointerId);move(e);}});
        canvas.addEventListener("pointermove",e=>{if(drag?.pointerId===e.pointerId)move(e);});
        ["pointerup","pointercancel"].forEach(type=>canvas.addEventListener(type,e=>{if(drag?.pointerId!==e.pointerId)return;drag=null;controls.enabled=true;canvas.releasePointerCapture?.(e.pointerId);sync();}));
        document.getElementById("artwork-grid")?.addEventListener("click",e=>{const c=e.target.closest(".artwork-card");if(c)addLayer(Number(c.dataset.artworkId));});
        document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>{const x=layers.get(selectedId);if(!x)return;const a=b.dataset.action;if(a==="scale-up"||a==="scale-down"){const f=a==="scale-up"?1.06:.94;x.layer.width=Math.min(.9,Math.max(.04,x.layer.width*f));x.layer.height=Math.min(.9,Math.max(.04,x.layer.height*f));project(x,x.position,x.normal);}else if(a==="rotate-left"||a==="rotate-right"){x.layer.rotation=Math.max(-180,Math.min(180,x.layer.rotation+(a==="rotate-left"?-5:5)));project(x,x.position,x.normal);}else if(a==="delete"){dispose(x);layers.delete(selectedId);selectedId=null;}sync();}));
        document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>{const is3d=b.dataset.mode==="3d";document.getElementById("designer-2d-stage")?.classList.toggle("is-hidden",is3d);stage.classList.toggle("is-hidden",!is3d);document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("is-active",x===b));if(is3d)resize();}));
        document.getElementById("variant-select")?.addEventListener("change",e=>{currentVariant=variants.find(v=>String(v.id)===String(e.target.value))||null;setColor(currentVariant?.hex);sync();});
        document.getElementById("designer-3d-rotation")?.addEventListener("input",e=>{rotation=THREE.MathUtils.degToRad(Number(e.target.value));shirt.rotation.y=rotation;render();});
        document.getElementById("designer-3d-reset")?.addEventListener("click",()=>{shirt.rotation.y=0;rotation=0;controls.reset();const s=document.getElementById("designer-3d-rotation");if(s)s.value="0";render();});
        document.getElementById("save-design")?.addEventListener("click",async e=>{e.preventDefault();e.stopImmediatePropagation();const b=e.currentTarget;b.disabled=true;status("در حال ذخیره طراحی…");try{const r=await fetch(root.dataset.saveUrl,{method:"POST",headers:{"Content-Type":"application/json","X-CSRFToken":csrf()},credentials:"same-origin",body:JSON.stringify({variant_id:document.getElementById("variant-select")?.value||null,version:2,preview_mode:"3d_procedural_tshirt",layers:[...layers.values()].map(x=>({...x.layer,three_d:{position:x.position?.toArray()||null,normal:x.normal?.toArray()||null,mesh:x.target?.name||null,size:x.size?.toArray()||null,mode:"procedural_tshirt_surface_decal",template:"babaei_tshirt_v1"}}))})});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"ذخیره طراحی انجام نشد.");status(`طراحی ذخیره شد · کد ${String(j.draft_id).slice(0,8)}`);}catch(err){status(err.message||"ذخیره طراحی انجام نشد.");}finally{b.disabled=false;}} ,{capture:true});
    }

    function move(e){const x=layers.get(selectedId),h=hits(e)[0];if(!x||!h)return;x.target=h.object;project(x,h.point,normal(h));}

    renderColors(); currentVariant=variants.find(v=>Number(v.stock)>0)||variants[0]||null; const select=document.getElementById("variant-select");if(select&&currentVariant)select.value=currentVariant.id;
    renderAreas(); setupScene(); setColor(currentVariant?.hex||"#ffffff"); bind(); sync();
    document.getElementById("designer-3d-progress")?.classList.add("is-hidden");document.getElementById("designer-3d-loading")?.classList.add("is-hidden");
    function animate(){requestAnimationFrame(animate);controls?.update();renderer?.render(scene,camera);} animate();window.addEventListener("resize",resize);
    window.BabaeiCustomizer3D={getPayload:()=>[...layers.values()].map(x=>x.layer),isReady:()=>Boolean(shirt&&meshes.length),setMode:m=>document.querySelector(`[data-mode="${m}"]`)?.click(),addArtwork:addLayer};
})();
