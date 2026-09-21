(() => {
    const canvas = document.querySelector('[data-particle-field]');
    const hero = document.querySelector('.home-hero');
    if (!canvas || !hero) return;

    /*
     * BABAEI Hero Particle Field
     * Rebuilt from the Gemini hero source supplied with the project.
     *
     * Source characteristics preserved:
     * - 80k-style point cloud
     * - superellipse / rounded-square distribution
     * - 120 world-unit radius
     * - perspective camera at z=240 / FOV 75
     * - custom point sprites
     * - additive blending
     * - continuous 3-axis organic rotation
     * - depth-based particle size and color
     */

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = () => window.innerWidth <= 700;

    let gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false
    });

    if (!gl) gl = canvas.getContext('experimental-webgl');
    if (!gl) return;

    const PARTICLES_DESKTOP = 60000;
    const PARTICLES_MOBILE = 26000;
    const RADIUS = 92;
    const CAMERA_Z = 240;
    const FOV = 75;
    const SPARK_N = 0.7;
    const ROUNDING = 0.18;

    const colors = [
        hex('#00B95C'),
        hex('#FFCC00'),
        hex('#FF4641'),
        hex('#3186FF')
    ];

    let width = 1;
    let height = 1;
    let dpr = 1;
    let count = 0;
    let raf = 0;
    let start = performance.now();
    let last = start;

    let targetRX = 0;
    let targetRY = 0;
    let rotationX = 0;
    let rotationY = 0;
    let rotationZ = 0;

    let positions;
    let colorsBuffer;
    let sizes;
    let theta;
    let radiusSeed;
    let zSeed;
    let sizeSeed;

    function hex(value) {
        const n = parseInt(value.slice(1), 16);
        return {
            r: ((n >> 16) & 255) / 255,
            g: ((n >> 8) & 255) / 255,
            b: (n & 255) / 255
        };
    }

    function smoothstep(a, b, x) {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    }

    function sign(value) {
        return value > 0 ? 1 : value < 0 ? -1 : 0;
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);

        createParticles();
    }

    function createParticles() {
        count = mobile() ? PARTICLES_MOBILE : PARTICLES_DESKTOP;

        positions = new Float32Array(count * 3);
        colorsBuffer = new Float32Array(count * 3);
        sizes = new Float32Array(count);

        theta = new Float32Array(count);
        radiusSeed = new Float32Array(count);
        zSeed = new Float32Array(count);
        sizeSeed = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            theta[i] = Math.random() * Math.PI * 2;
            radiusSeed[i] = Math.pow(Math.random(), 5);
            zSeed[i] =
                Math.random() +
                Math.random() +
                Math.random() -
                1.5;
            sizeSeed[i] = 0.8 + Math.random() * 1.2;
        }
    }

    const vertexShaderSource = `
        attribute vec3 aPosition;
        attribute vec3 aColor;
        attribute float aSize;

        uniform float uAspect;
        uniform float uFocal;
        uniform float uCameraZ;
        uniform float uPixelRatio;

        varying vec3 vColor;

        void main() {
            vColor = aColor;

            float cameraZ = aPosition.z - uCameraZ;
            float safeZ = min(-1.0, cameraZ);

            float x = (aPosition.x * uFocal / uAspect) / -safeZ;
            float y = (aPosition.y * uFocal) / -safeZ;

            gl_Position = vec4(x, y, 0.0, 1.0);

            gl_PointSize =
                aSize *
                uPixelRatio *
                (250.0 / -safeZ);
        }
    `;

    const fragmentShaderSource = `
        precision mediump float;

        varying vec3 vColor;

        void main() {
            float dist = length(gl_PointCoord - vec2(0.5));

            if (dist > 0.5) discard;

            float alpha = 1.0 - smoothstep(0.36, 0.5, dist);

            gl_FragColor = vec4(vColor, alpha);
        }
    `;

    function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    const vertexShader = compile(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    gl.useProgram(program);

    const positionLocation = gl.getAttribLocation(program, 'aPosition');
    const colorLocation = gl.getAttribLocation(program, 'aColor');
    const sizeLocation = gl.getAttribLocation(program, 'aSize');

    const aspectLocation = gl.getUniformLocation(program, 'uAspect');
    const focalLocation = gl.getUniformLocation(program, 'uFocal');
    const cameraZLocation = gl.getUniformLocation(program, 'uCameraZ');
    const pixelRatioLocation = gl.getUniformLocation(program, 'uPixelRatio');

    const positionBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    const sizeBuffer = gl.createBuffer();

    function updateBuffer(buffer, data, location, size) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }

    function updateGeometry(elapsed) {
        /*
         * Same core geometry as the supplied Gemini implementation:
         *
         * x/y are generated from a superellipse:
         * abs(cos(theta))^(2/n) * sign(cos(theta))
         * abs(sin(theta))^(2/n) * sign(sin(theta))
         *
         * Then blended toward a circle using roundingFactor.
         */
        const n =
            (3.5 + SPARK_N) / 2 +
            (3.5 - SPARK_N) / 2 *
            Math.sin(elapsed * 0.0012);

        const scatter = 1.0;

        const phase = elapsed * 0.00022;

        const sinX = Math.sin(phase * 2);
        const sinY = Math.sin(phase);
        const sinZ = Math.sin(phase);

        const rx = Math.pow(sinX, 3) * 0.85;
        const ry = Math.pow(sinY, 3) * 1.15;
        const rz = Math.pow(sinZ, 3) * -0.65;

        const sx = Math.sin(rx);
        const cx = Math.cos(rx);
        const sy = Math.sin(ry);
        const cy = Math.cos(ry);
        const sz = Math.sin(rz);
        const cz = Math.cos(rz);

        /*
         * Slowly respond to the mouse like the original OrbitControls
         * interaction, without enabling zoom.
         */
        rotationX += (targetRX - rotationX) * 0.035;
        rotationY += (targetRY - rotationY) * 0.035;

        const mx = Math.sin(rotationX);
        const mcx = Math.cos(rotationX);
        const my = Math.sin(rotationY);
        const mcy = Math.cos(rotationY);

        const pointRotationX = rotationX * 0.35;
        const pointRotationY = rotationY * 0.45;

        const prx = Math.sin(pointRotationX);
        const pcx = Math.cos(pointRotationX);
        const pry = Math.sin(pointRotationY);
        const pcy = Math.cos(pointRotationY);

        let minZ = Infinity;
        let maxZ = -Infinity;

        for (let i = 0; i < count; i++) {
            const t = theta[i];
            const r = radiusSeed[i];

            const cosT = Math.cos(t);
            const sinT = Math.sin(t);

            const superX =
                Math.abs(cosT) ** (2 / n) * sign(cosT);

            const superY =
                Math.abs(sinT) ** (2 / n) * sign(sinT);

            const rounding =
                ROUNDING * Math.cos(2 * t) ** 2;

            let x =
                superX * (1 - rounding) +
                cosT * rounding;

            let y =
                superY * (1 - rounding) +
                sinT * rounding;

            /*
             * Gemini scatters points radially from a compact core.
             * The fifth-power distribution heavily favors the inner
             * surface and produces the characteristic dense dust.
             */
            const radialScale =
                1 + r * scatter - 0.04;

            x *= RADIUS * radialScale;
            y *= RADIUS * radialScale;

            let z =
                zSeed[i] *
                RADIUS *
                (0.1 + 1.2 * scatter);

            /*
             * A gentle organic breathing deformation prevents the cloud
             * from reading as a mathematically perfect sphere.
             */
            const organic =
                Math.sin(t * 3 + elapsed * 0.00045) *
                (2.0 + r * 5.0);

            x += organic * Math.cos(t * 2.0);
            y += organic * Math.sin(t * 2.0);

            /*
             * Apply the slow continuous 3-axis rotation from the source.
             */
            let yy = y * cx - z * sx;
            let zz = y * sx + z * cx;
            y = yy;
            z = zz;

            let xx = x * cy + z * sy;
            zz = -x * sy + z * cy;
            x = xx;
            z = zz;

            xx = x * cz - y * sz;
            yy = x * sz + y * cz;
            x = xx;
            y = yy;

            /*
             * Apply subtle pointer rotation on top.
             */
            yy = y * pcx - z * prx;
            zz = y * prx + z * pcx;
            y = yy;
            z = zz;

            xx = x * pcy + z * pry;
            zz = -x * pry + z * pcy;
            x = xx;
            z = zz;

            const o = i * 3;

            positions[o] = x;
            positions[o + 1] = y;
            positions[o + 2] = z;

            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);

            /*
             * Depth controls point size exactly like the source.
             * Front particles are brighter and slightly larger.
             */
            const depth = Math.max(0, Math.min(1, (z + RADIUS) / (RADIUS * 2)));

            sizes[i] =
                sizeSeed[i] *
                (0.52 + depth * 0.95) *
                (0.72 + r * 0.45);

            /*
             * Use the Gemini source palette. BABAEI starts green,
             * then slowly travels through the same Google palette.
             */
            const cycle =
                (elapsed * 0.000035 + r * 0.25 + depth * 0.42) % 4;

            const index = Math.floor(cycle);
            const next = (index + 1) % 4;
            const mix = smoothstep(0, 1, cycle - index);

            const c1 = colors[index];
            const c2 = colors[next];

            /*
             * Keep BABAEI's field predominantly green while retaining
             * the reference's color-changing behavior.
             */
            const greenBias = 0.72;

            let cr = c1.r + (c2.r - c1.r) * mix;
            let cg = c1.g + (c2.g - c1.g) * mix;
            let cb = c1.b + (c2.b - c1.b) * mix;

            cr *= 1 - greenBias * 0.32;
            cg = Math.min(1, cg + greenBias * 0.18);
            cb *= 1 - greenBias * 0.20;

            /*
             * Slightly darken the rear of the cloud.
             */
            const brightness =
                0.24 +
                depth * 0.76;

            colorsBuffer[o] = cr * brightness;
            colorsBuffer[o + 1] = cg * brightness;
            colorsBuffer[o + 2] = cb * brightness;
        }
    }

    function render(now) {
        const elapsed = now - start;
        last = now;

        const focal =
            1 / Math.tan((FOV * Math.PI / 180) * 0.5);

        updateGeometry(elapsed);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.disable(gl.DEPTH_TEST);

        gl.useProgram(program);

        updateBuffer(
            positionBuffer,
            positions,
            positionLocation,
            3
        );

        updateBuffer(
            colorBuffer,
            colorsBuffer,
            colorLocation,
            3
        );

        updateBuffer(
            sizeBuffer,
            sizes,
            sizeLocation,
            1
        );

        gl.uniform1f(
            aspectLocation,
            width / Math.max(1, height)
        );

        gl.uniform1f(focalLocation, focal);
        gl.uniform1f(cameraZLocation, CAMERA_Z);
        gl.uniform1f(pixelRatioLocation, dpr);

        gl.drawArrays(gl.POINTS, 0, count);

        if (!reduced) {
            raf = requestAnimationFrame(render);
        }
    }

    canvas.addEventListener('pointermove', (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;

        targetRY = x * 0.38;
        targetRX = -y * 0.28;
    }, { passive: true });

    canvas.addEventListener('pointerleave', () => {
        targetRX = 0;
        targetRY = 0;
    }, { passive: true });

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    resize();
    render(performance.now());

    window.addEventListener('pagehide', () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
    }, { once: true });
})();
