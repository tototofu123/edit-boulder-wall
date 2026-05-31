const img = document.getElementById('wall-img');
    const svg = document.getElementById('overlay');
    const wrapper = document.getElementById('canvas-wrapper');
    const viewport = document.getElementById('viewport');
    
    let holds = [], richMetadata = {}, holdSpec = [], calibrationData = [], boundaryPoints = [];
    let scale = 1.0, translateX = 0, translateY = 0, isDragging = false, lastX, lastY;
    let activeRoute = null, routeCount = 0;
    let selectedFeedbackId = null; 
    let feedbackCache = {}; 
    const AI_SEED_STORAGE_KEY = 'edit-boulder-wall-ai-seed-v1';

    const typeColors = { 1: '#00ff00', 2: '#007acc', 3: '#ff8800', 4: '#ff0000' };
    const typeNames = { 1: 'START', 2: 'HAND', 3: 'FOOT', 4: 'END' };
    const catMapFull = { 'C': 'climbing holds', 'I': 'insert holds', 'F': 'wall features' };

    img.onload = () => { svg.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`); loadData(); setTimeout(initFit, 100); };
    function initFit() { const vRect = viewport.getBoundingClientRect(); scale = Math.min(vRect.width / img.naturalWidth, vRect.height / img.naturalHeight); translateX = (vRect.width - img.naturalWidth * scale) / 2; translateY = (vRect.height - img.naturalHeight * scale) / 2; updateTransform(); }
    function updateTransform() { wrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`; }

    viewport.onwheel = (e) => { e.preventDefault(); const delta = e.deltaY > 0 ? 0.9 : 1.1; const oldScale = scale; scale = Math.min(Math.max(scale * delta, 0.01), 15); const vRect = viewport.getBoundingClientRect(); const mouseX = e.clientX - vRect.left, mouseY = e.clientY - vRect.top; translateX = mouseX - (mouseX - translateX) * (scale / oldScale); translateY = mouseY - (mouseY - translateY) * (scale / oldScale); updateTransform(); };
    viewport.onmousedown = (e) => { if (e.target.tagName === 'img' || e.target.tagName === 'svg') { isDragging = true; lastX = e.clientX; lastY = e.clientY; } };
    window.onmousemove = (e) => { if (isDragging) { translateX += (e.clientX - lastX); translateY += (e.clientY - lastY); lastX = e.clientX; lastY = e.clientY; updateTransform(); } };
    window.onmouseup = () => isDragging = false;

    async function loadData() {
        try {
            holds = await (await fetch('docs/hold_annotations.json')).json();
            richMetadata = await (await fetch('docs/holds_data.json')).json();
            holdSpec = await (await fetch('docs/HOLD_SPEC.json')).json().catch(()=>[]);
            calibrationData = await (await fetch('docs/calibration.json')).json().catch(()=>[]);
            boundaryPoints = await (await fetch('docs/wall_annotations.json')).json().catch(()=>[]);
            
            const storedSeed = localStorage.getItem(AI_SEED_STORAGE_KEY);
            if (storedSeed && !Number.isNaN(Number(storedSeed))) {
                document.getElementById('ai-seed').value = String(Number(storedSeed));
            }
            if (!localStorage.getItem(AI_SEED_STORAGE_KEY)) {
                const initialSeed = Math.floor(Date.now() % 1000000000);
                document.getElementById('ai-seed').value = String(initialSeed);
                localStorage.setItem(AI_SEED_STORAGE_KEY, String(initialSeed));
            }

            // Initialize routeCount from log
            const logs = await (await fetch('docs/ai_generation_log.json')).json().catch(()=>[]);
            routeCount = logs.filter(l => l.type === 'ai_generation').length;
            
            render();
        } catch(e) { console.error("Data load failed", e); }
    }

    function toggleConfig() {
        const p = document.getElementById('ai-config');
        p.style.display = p.style.display === 'block' ? 'none' : 'block';
    }

    function randomizeSeed() {
        const nextSeed = Math.floor(Math.random() * 1000000000);
        document.getElementById('ai-seed').value = String(nextSeed);
        localStorage.setItem(AI_SEED_STORAGE_KEY, String(nextSeed));
    }

    async function generate() {
        if (Object.keys(feedbackCache).length > 0) {
            await saveFeedbackLog();
        }

        if (window.generateTraverseRoute) {
            const ctx = {
                holds, richMetadata, catMapFull, holdSpec, boundaryPoints, pixelsToMeters,
                height: parseFloat(document.getElementById('ai-height').value),
                wingspan: parseFloat(document.getElementById('ai-wingspan').value),
                targetLen: parseFloat(document.getElementById('ai-length').value),
                holdDensity: parseInt(document.getElementById('ai-density').value),
                targetGradeNum: parseInt(document.getElementById('ai-grade').value),
                targetGradeStr: 'V' + document.getElementById('ai-grade').value,
                seed: parseInt(document.getElementById('ai-seed').value),
                allowedCats: [],
                routeCount: routeCount,
                setActiveRoute: (route) => {
                    activeRoute = route;
                    routeCount++; // Increment on success
                    document.getElementById('route-details').style.display = 'block';
                    document.getElementById('btn-play-beta').style.display = 'block';
                    feedbackCache = {}; 
                    selectedFeedbackId = null;
                    render();
                },
                render: () => { render(); }
            };
            if (document.getElementById('ai-cat-c').checked) ctx.allowedCats.push('C');
            if (document.getElementById('ai-cat-i').checked) ctx.allowedCats.push('I');
            if (document.getElementById('ai-cat-f').checked) ctx.allowedCats.push('F');
            localStorage.setItem(AI_SEED_STORAGE_KEY, document.getElementById('ai-seed').value);
            
            window.generateTraverseRoute(ctx);
        }
    }

    function render() {
        svg.innerHTML = '';
        if (!activeRoute) return;

        // 1. Draw Ideal Line
        if (activeRoute.idealLine) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute('x1', activeRoute.idealLine.p1.x); line.setAttribute('y1', activeRoute.idealLine.p1.y);
            line.setAttribute('x2', activeRoute.idealLine.p2.x); line.setAttribute('y2', activeRoute.idealLine.p2.y);
            line.setAttribute('class', 'ideal-line');
            svg.appendChild(line);
        }

        // 2. Draw Connection Lines
        const handOrder = activeRoute.order.filter(id => activeRoute.holds[id] !== 3);
        for (let i = 0; i < handOrder.length - 1; i++) {
            const h1 = holds.find(x => x.id === handOrder[i]);
            const h2 = holds.find(x => x.id === handOrder[i+1]);
            if (!h1 || !h2) continue;
            
            const lineId = `${h1.id}_${h2.id}`;
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute('x1', h1.center.x); line.setAttribute('y1', h1.center.y);
            line.setAttribute('x2', h2.center.x); line.setAttribute('y2', h2.center.y);
            line.setAttribute('class', `assisted-line ${selectedFeedbackId === lineId ? 'selected' : ''}`);
            line.onclick = (e) => { e.stopPropagation(); selectFeedback(lineId, `Move: ${i+1} -> ${i+2}`); };
            svg.appendChild(line);

            const distPx = Math.hypot(h1.center.x - h2.center.x, h1.center.y - h2.center.y);
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute('x', (h1.center.x + h2.center.x)/2); text.setAttribute('y', (h1.center.y + h2.center.y)/2 - 10);
            text.setAttribute('class', 'route-dist-text');
            text.textContent = `${pixelsToMeters(distPx).toFixed(2)}m`;
            svg.appendChild(text);
        }

        // 3. Draw Route Holds and Labels
        let labelCounts = { 1:0, 2:0, 3:0 };
        activeRoute.order.forEach(id => {
            const h = holds.find(x => x.id === id);
            const type = activeRoute.holds[id];
            const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
            p.setAttribute('d', h.path);
            p.setAttribute('class', `hold-path route ${selectedFeedbackId === id ? 'selected' : ''}`);
            p.style.stroke = typeColors[type];
            p.onclick = (e) => { e.stopPropagation(); selectFeedback(id, `Hold: ${id}`); };
            svg.appendChild(p);

            // Labels
            let label = "";
            if (type === 1) { labelCounts[1]++; label = `S${labelCounts[1] > 1 ? labelCounts[1] : ''}`; }
            else if (type === 2) { labelCounts[2]++; label = `${labelCounts[2]}`; }
            else if (type === 3) { labelCounts[3]++; label = `F${labelCounts[3]}`; }
            else if (type === 4) { label = "Top"; }

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute('x', h.center.x); 
            text.setAttribute('y', h.center.y - 40);
            text.setAttribute('class', 'route-hold-label');
            text.setAttribute('text-anchor', 'middle');
            text.textContent = label;
            svg.appendChild(text);
        });

        updateSidebarDetails();
    }

    function updateSidebarDetails() {
        if (!activeRoute) return;
        const handOrder = activeRoute.order.filter(id => activeRoute.holds[id] !== 3);
        
        document.getElementById('route-id-name').innerText = `${activeRoute.name} (${activeRoute.grade})`;
        document.getElementById('stat-holds').innerText = activeRoute.order.length;

        // Calculate total dist
        let totalDist = 0;
        for (let i = 0; i < handOrder.length - 1; i++) {
            const h1 = holds.find(x => x.id === handOrder[i]);
            const h2 = holds.find(x => x.id === handOrder[i+1]);
            totalDist += pixelsToMeters(Math.hypot(h1.center.x - h2.center.x, h1.center.y - h2.center.y));
        }
        document.getElementById('stat-dist').innerText = totalDist.toFixed(2) + "m";

        const list = document.getElementById('seq-list');
        list.innerHTML = "";
        
        activeRoute.order.forEach((id, i) => {
            const h = holds.find(x => x.id === id);
            const type = activeRoute.holds[id];
            const item = document.createElement('div');
            item.className = `hold-item ${selectedFeedbackId === id ? 'selected' : ''}`;
            item.onclick = () => selectFeedback(id, `Hold: ${id}`);
            
            let extra = "";
            if (type !== 3) { // If Hand
                const nextHandId = activeRoute.order.slice(i+1).find(nid => activeRoute.holds[nid] !== 3);
                if (nextHandId) {
                    const nh = holds.find(x => x.id === nextHandId);
                    const d = pixelsToMeters(Math.hypot(h.center.x - nh.center.x, h.center.y - nh.center.y));
                    extra = `<span style="color:#666">Next Hand: <b>${d.toFixed(2)}m</b></span>`;
                }
            } else { // If Foot
                // Find associated hand (previous or current move)
                extra = `<span style="color:#888 italic">Associated Footing</span>`;
            }

            const [cx, cy] = h.cell.split(',').map(n => parseInt(n) + 1);
            const id5 = `${h.cat}${cx}${cy}${h.num.toString().padStart(2, '0')}`;

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <b style="color:${typeColors[type]}">${typeNames[type]}</b>
                    <span style="color:#aaa">${id5}</span>
                </div>
                ${extra}
            `;
            list.appendChild(item);
        });
    }

    function selectFeedback(id, label) {
        // Save current text to cache before switching
        if (selectedFeedbackId) {
            feedbackCache[selectedFeedbackId] = document.getElementById('feedback-text').value;
        }

        selectedFeedbackId = id;
        document.getElementById('feedback-panel').style.display = 'block';
        document.getElementById('feedback-target').innerText = label;
        document.getElementById('feedback-text').value = feedbackCache[id] || "";
        render();
    }

    async function saveFeedbackLog() {
        // Sync current open text box to cache
        if (selectedFeedbackId) {
            feedbackCache[selectedFeedbackId] = document.getElementById('feedback-text').value;
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            route: activeRoute,
            problems: feedbackCache
        };

        try {
            await fetch('/save_auto_log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'ai_mode_feedback', data: logEntry })
            });
        } catch(e) { console.error("Feedback save failed", e); }
    }

    // --- STICKMAN BETA ENGINE ---
    let simulator = null;
    const stickSvg = document.getElementById('stickman-overlay');

    function drawSkeleton(skeleton) {
        stickSvg.innerHTML = '';
        if (!skeleton) return;

        function line(p1, p2) {
            const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
            l.setAttribute('x1', p1.x); l.setAttribute('y1', p1.y);
            l.setAttribute('x2', p2.x); l.setAttribute('y2', p2.y);
            l.setAttribute('class', 'stickman-bone');
            stickSvg.appendChild(l);
        }

        function joint(p) {
            const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
            c.setAttribute('r', 5);
            c.setAttribute('class', 'stickman-joint');
            stickSvg.appendChild(c);
        }

        // Spine & Shoulders
        line(skeleton.shoulderL, skeleton.shoulderR);
        line(skeleton.hipL, skeleton.hipR);
        const midShoulder = { x: (skeleton.shoulderL.x + skeleton.shoulderR.x)/2, y: (skeleton.shoulderL.y + skeleton.shoulderR.y)/2 };
        const midHip = { x: (skeleton.hipL.x + skeleton.hipR.x)/2, y: (skeleton.hipL.y + skeleton.hipR.y)/2 };
        line(midShoulder, midHip);
        
        // Arms (two-segment: shoulder -> elbow -> hand)
        if (skeleton.elbowL) {
            line(skeleton.shoulderL, skeleton.elbowL);
            line(skeleton.elbowL, skeleton.handL);
        } else {
            line(skeleton.shoulderL, skeleton.handL);
        }
        if (skeleton.elbowR) {
            line(skeleton.shoulderR, skeleton.elbowR);
            line(skeleton.elbowR, skeleton.handR);
        } else {
            line(skeleton.shoulderR, skeleton.handR);
        }

        // Legs (two-segment: hip -> knee -> foot)
        if (skeleton.kneeL) {
            line(skeleton.hipL, skeleton.kneeL);
            line(skeleton.kneeL, skeleton.footL);
        } else {
            line(skeleton.hipL, skeleton.footL);
        }
        if (skeleton.kneeR) {
            line(skeleton.hipR, skeleton.kneeR);
            line(skeleton.kneeR, skeleton.footR);
        } else {
            line(skeleton.hipR, skeleton.footR);
        }

        // Head
        const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        head.setAttribute('cx', skeleton.head.x); head.setAttribute('cy', skeleton.head.y);
        head.setAttribute('r', 18);
        head.setAttribute('class', 'stickman-head');
        stickSvg.appendChild(head);

        // Draw Joints
        [skeleton.shoulderL, skeleton.shoulderR, skeleton.hipL, skeleton.hipR, skeleton.handL, skeleton.handR, skeleton.footL, skeleton.footR, skeleton.elbowL, skeleton.elbowR, skeleton.kneeL, skeleton.kneeR].forEach(j => { if (j) joint(j); });
    }

    let isPlayingBeta = false;
    async function playBeta() {
        if (!activeRoute || isPlayingBeta) return;
        isPlayingBeta = true;
        
        const h = parseFloat(document.getElementById('ai-height').value);
        const w = parseFloat(document.getElementById('ai-wingspan').value);
        if (!window.StickmanSimulator) { alert("Beta Engine loading..."); return; }
        
        simulator = new window.StickmanSimulator(h, w, pixelsToMeters);
        const startHold = holds.find(x => x.id === activeRoute.order[0]);
        
        let currentSkeleton = simulator.getDefaultPose(startHold.center);

        // Try to initialize from the route's own start footholds so the climber doesn't crunch at launch.
        const routeFoots = activeRoute.order
            .map(id => ({ id, hold: holds.find(x => x.id === id), type: activeRoute.holds[id] }))
            .filter(x => x.hold && x.type === 3)
            .map(x => x.hold.center);

        const defaultFeet = { footL: currentSkeleton.footL, footR: currentSkeleton.footR };
        const firstFootL = routeFoots[0] || defaultFeet.footL;
        const firstFootR = routeFoots[1] || routeFoots[0] || defaultFeet.footR;

        // Initialize contacts with both hands on the start hold and feet on actual footholds when available.
        let contacts = { handL: startHold.center, handR: startHold.center, footL: firstFootL, footR: firstFootR };

        // Update the pose immediately so the first drawn stickman reflects the starting stance.
        currentSkeleton = simulator.solvePose(contacts);
        drawSkeleton(currentSkeleton);

        // For each move in the route
        for (let i = 0; i < activeRoute.order.length; i++) {
            const holdId = activeRoute.order[i];
            const hold = holds.find(x => x.id === holdId);
            const type = activeRoute.holds[holdId];

            // Helper: get hold metadata (difficulty, type) similar to generator
            function getHoldMeta(h) {
                const meta = (richMetadata[h.cell] || {})[`${catMapFull[h.cat]}${h.num}`] || {};
                return { diff: parseInt(meta.difficulty || '1'), type: (meta.type || '').toLowerCase() };
            }

            if (type === 1 || type === 2 || type === 4) { // HAND MOVE
                const meta = getHoldMeta(hold);
                // Choose a single hand to move (never move both hands at once)
                const dL = Math.hypot(contacts.handL.x - hold.center.x, contacts.handL.y - hold.center.y);
                const dR = Math.hypot(contacts.handR.x - hold.center.x, contacts.handR.y - hold.center.y);
                const mover = dL > dR ? 'handL' : 'handR';

                // reach check: compute shoulder position and limb reach in pixels
                const wPx = simulator.metersToPixels(w);
                const limbLenPx = wPx * 0.45;
                const maxReachPx = limbLenPx * 1.05;
                const shoulder = mover === 'handL' ? currentSkeleton.shoulderL : currentSkeleton.shoulderR;
                const distToTarget = Math.hypot(shoulder.x - hold.center.x, shoulder.y - hold.center.y);

                if (distToTarget > maxReachPx) {
                    // Cannot reach: try to move a nearby scheduled foot first (lookahead)
                    const upcoming = activeRoute.order.slice(i+1);
                    const nextFootId = upcoming.find(id => activeRoute.holds[id] === 3);
                    if (nextFootId) {
                        const footHold = holds.find(x => x.id === nextFootId);
                        // assign foot to appropriate side (prefer same side as hold)
                        const midHipX = (currentSkeleton.hipL.x + currentSkeleton.hipR.x) / 2;
                        if (footHold.center.x < midHipX) contacts.footL = footHold.center; else contacts.footR = footHold.center;
                        // animate foot reposition first
                        let footSkeleton = simulator.solvePose(contacts);
                        await animateTo(currentSkeleton, footSkeleton);
                        currentSkeleton = footSkeleton;
                    } else {
                        // no foot available to help — fallback: move the other hand if it's closer
                        const other = mover === 'handL' ? 'handR' : 'handL';
                        contacts[other] = hold.center;
                        const fallbackSkeleton = simulator.solvePose(contacts);
                        await animateTo(currentSkeleton, fallbackSkeleton);
                        currentSkeleton = fallbackSkeleton;
                        continue; // proceed to next move
                    }
                }

                // For easy holds/jugs, it's okay to "match" later, but still move one hand now
                contacts[mover] = hold.center;
            } else if (type === 3) { // FOOT MOVE
                // Choose foot based on hip midline (avoid crossing)
                const midHipX = (currentSkeleton.hipL.x + currentSkeleton.hipR.x) / 2;
                if (!contacts.footL && !contacts.footR) {
                    // No feet yet, pick based on side
                    if (hold.center.x < midHipX) contacts.footL = hold.center;
                    else contacts.footR = hold.center;
                } else {
                    // Prefer the foot on the same side as the hold to avoid crossing
                    if (hold.center.x < midHipX) contacts.footL = hold.center;
                    else contacts.footR = hold.center;
                }
                // Allow switching: if the chosen foot would be awkward (very far), fall back to distance heuristic
                const chosen = (hold.center.x < midHipX) ? 'footL' : 'footR';
                const other = chosen === 'footL' ? 'footR' : 'footL';
                const dChosen = contacts[chosen] ? Math.hypot(contacts[chosen].x - hold.center.x, contacts[chosen].y - hold.center.y) : 9999;
                const dOther = contacts[other] ? Math.hypot(contacts[other].x - hold.center.x, contacts[other].y - hold.center.y) : 9999;
                if (dOther + 0.01 < dChosen) {
                    contacts[other] = hold.center;
                }
            }

            const targetSkeleton = simulator.solvePose(contacts);
            await animateTo(currentSkeleton, targetSkeleton);
            currentSkeleton = targetSkeleton;
            await new Promise(r => setTimeout(r, 400));
        }

        isPlayingBeta = false;
    }

    function animateTo(start, end) {
        return new Promise(resolve => {
            const duration = 600;
            const startTime = performance.now();
            
            function frame(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress * (2 - progress); // Simple ease out

                const intermediate = {};
                for (let key in start) {
                    intermediate[key] = {
                        x: start[key].x + (end[key].x - start[key].x) * ease,
                        y: start[key].y + (end[key].y - start[key].y) * ease
                    };
                }
                drawSkeleton(intermediate);

                if (progress < 1) requestAnimationFrame(frame);
                else resolve();
            }
            requestAnimationFrame(frame);
        });
    }

    function pixelsToMeters(px) {
        if (!calibrationData.length) return px / 500;
        let sumScale = 0;
        calibrationData.forEach(c => { 
            const pxDist = Math.hypot(c.p1.x - c.p2.x, c.p1.y - c.p2.y); 
            sumScale += (c.lengthMeters / pxDist); 
        });
        return px * (sumScale / calibrationData.length);
    }

