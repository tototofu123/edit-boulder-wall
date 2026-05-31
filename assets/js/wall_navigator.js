const img = document.getElementById('wall-img');
    const svg = document.getElementById('overlay');
    const wrapper = document.getElementById('canvas-wrapper');
    const viewport = document.getElementById('viewport');
    const status = document.getElementById('status');
    const mStatus = document.getElementById('measure-status');
    
    let holds = [], richMetadata = {}, holdSpec = [], calibrationData = [], measurements = [], boundaryPoints = [], allRoutes = [];
    let holdTypeOptions = ['uncategorized'];
    let auditOrder = [];
    let auditOrderIndex = -1;
    let transferredHoldIds = new Set();
    let auditFields = ['edit-cat', 'edit-num', 'edit-type', 'edit-grab', 'edit-hand-diff', 'edit-foot-diff', 'edit-general-usability', 'edit-ideal'];
    let auditFieldIndex = 0;
    let appMode = 'clean', currentTool = 'none', selectedHoldId = null, selectedLinkId = null;
    let scale = 1.0, translateX = 0, translateY = 0, isDragging = false, lastX, lastY, clickQueue = [];
    let activeRoute = null, settingType = 1;

    const typeColors = { 1: '#00ff00', 2: '#007acc', 3: '#ff8800', 4: '#ff0000' };
    const typeNames = { 1: 'START', 2: 'HAND', 3: 'FOOT', 4: 'END' };

    const catNames = { 'C': 'Climbing', 'I': 'Insert', 'F': 'Feature' };
    const catMapFull = { 'C': 'climbing holds', 'I': 'insert holds', 'F': 'wall features' };
    const colors = { 'C': '#ff4444', 'I': '#44ff44', 'F': '#ffff44' };
    const typeShorthand = { 'crimp': 'Cr', 'jug': 'Jg', 'pocket': 'Pk', 'sloper': 'Sl', 'pinch': 'Pn', 'jib': 'Jb', 'uncategorized': 'Un' };
    const clockMap = { 0: "12", 45: "01", 90: "03", 135: "04", 180: "06", 225: "07", 270: "09", 315: "10" };
    const AUDIT_STORAGE_KEY = 'edit-boulder-wall-audit-transferred-v1';

    img.onload = () => { svg.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`); loadData(); setTimeout(initFit, 100); };
    function initFit() { const vRect = viewport.getBoundingClientRect(); scale = Math.min(vRect.width / img.naturalWidth, vRect.height / img.naturalHeight); translateX = (vRect.width - img.naturalWidth * scale) / 2; translateY = (vRect.height - img.naturalHeight * scale) / 2; updateTransform(); }
    function updateTransform() { wrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`; }

    viewport.onwheel = (e) => { e.preventDefault(); const delta = e.deltaY > 0 ? 0.9 : 1.1; const oldScale = scale; scale = Math.min(Math.max(scale * delta, 0.01), 15); const vRect = viewport.getBoundingClientRect(); const mouseX = e.clientX - vRect.left, mouseY = e.clientY - vRect.top; translateX = mouseX - (mouseX - translateX) * (scale / oldScale); translateY = mouseY - (mouseY - translateY) * (scale / oldScale); updateTransform(); };
    viewport.onmousedown = (e) => { if (currentTool !== 'none' && currentTool !== 'manual-set' && currentTool !== 'ai-set') return; if (e.target.tagName !== 'path' && e.target.tagName !== 'line') { isDragging = true; lastX = e.clientX; lastY = e.clientY; } };
    window.onmousemove = (e) => { if (isDragging) { translateX += (e.clientX - lastX); translateY += (e.clientY - lastY); lastX = e.clientX; lastY = e.clientY; updateTransform(); } };
    window.onmouseup = () => isDragging = false;

    window.onkeydown = (e) => {
        const activeTag = document.activeElement.tagName;
        if (currentTool !== 'audit' && (activeTag === 'INPUT' || activeTag === 'SELECT')) return;

        if (currentTool === 'audit') {
            if (e.key === 'p' || e.key === 'P') {
                if (auditOrder.length) setAuditSelectedHoldByIndex(auditOrderIndex + 1);
                return;
            }
            if (e.key === 'o' || e.key === 'O') {
                if (auditOrder.length) setAuditSelectedHoldByIndex(auditOrderIndex - 1);
                return;
            }
            if (e.key === 'ArrowDown') { e.preventDefault(); focusAuditField(1); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); focusAuditField(-1); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); adjustAuditField(-1); return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); adjustAuditField(1); return; }
        }

        if (e.key === 'p' || e.key === 'P') toggleMode('manual-set');
        if (e.key === 'o' || e.key === 'O') toggleMode('ai-set');
        if (e.key === 'a' || e.key === 'A') toggleMode('audit');
        if (currentTool === 'manual-set') {
            if (['1', '2', '3', '4', '5'].includes(e.key)) setSettingType(parseInt(e.key));
        }
        if (currentTool === 'audit' && selectedHoldId) {
            if (['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(e.key)) {
                const value = e.key === '0' ? '10' : e.key;
                const field = document.getElementById(auditFields[auditFieldIndex]);
                if (field && field.type === 'number') {
                    field.value = value;
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    commitAuditEdits();
                }
            }
        }
    };

    async function loadData() {
        try {
            holds = await (await fetch('docs/hold_annotations.json')).json();
            richMetadata = await (await fetch('docs/holds_data.json')).json();
            holdSpec = await (await fetch('docs/HOLD_SPEC.json')).json().catch(()=>[]);
            try {
                const stored = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
                transferredHoldIds = new Set(Array.isArray(stored) ? stored.map(String) : []);
            } catch (err) {
                transferredHoldIds = new Set();
            }
            calibrationData = await (await fetch('docs/calibration.json')).json().catch(()=>[]);
            measurements = await (await fetch('docs/measurements.json')).json().catch(()=>[]);
            boundaryPoints = await (await fetch('docs/wall_annotations.json')).json().catch(()=>[]);
            allRoutes = await (await fetch('docs/all_routes.json')).json().catch(()=>[]);
            refreshHoldTypeOptions();
            rebuildAuditOrder();
            render();
            status.innerText = `READY: ${holds.length} HOLDS`;
        } catch(e) { status.innerText = "DATA LOAD ERROR"; }
    }

    function refreshHoldTypeOptions() {
        const types = new Set(['uncategorized']);
        holdSpec.forEach(spec => { if (spec?.type) types.add(String(spec.type)); });
        holds.forEach(h => {
            const meta = (richMetadata[h.cell] || {})[`${catMapFull[h.cat]}${h.num}`] || {};
            if (meta.type) types.add(String(meta.type));
        });
        holdTypeOptions = Array.from(types).sort((a, b) => a.localeCompare(b));
        const typeSelect = document.getElementById('edit-type');
        if (typeSelect) {
            typeSelect.innerHTML = holdTypeOptions.map(type => `<option value="${type}">${type}</option>`).join('');
        }
    }

    function rebuildAuditOrder() {
        auditOrder = [...holds].sort((a, b) => {
            const [ax, ay] = a.cell.split(',').map(n => parseInt(n, 10) || 0);
            const [bx, by] = b.cell.split(',').map(n => parseInt(n, 10) || 0);
            if (ax !== bx) return ax - bx;
            if (ay !== by) return ay - by;
            const aType = String(getHoldSpecForHold(a).type || '');
            const bType = String(getHoldSpecForHold(b).type || '');
            if (aType !== bType) return aType.localeCompare(bType);
            return a.num - b.num;
        });
    }

    function getAuditHoldKey(h) {
        const resolved = getHoldSpecForHold(h);
        return `${h.cell}|${resolved.type || 'uncategorized'}|${h.num}`;
    }

    function isHoldTransferred(h) {
        return transferredHoldIds.has(getAuditHoldKey(h));
    }

    function markHoldTransferred(h) {
        transferredHoldIds.add(getAuditHoldKey(h));
        localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(Array.from(transferredHoldIds)));
    }

    function getFirstUntransferredHold() {
        return auditOrder.find(h => !isHoldTransferred(h)) || null;
    }

    function jumpToNextUntransferredHold() {
        if (!auditOrder.length) return;
        const nextHold = getFirstUntransferredHold();
        if (!nextHold) {
            setAuditToast('All holds are transferred.');
            return;
        }
        const index = auditOrder.findIndex(item => item.id === nextHold.id);
        if (index >= 0) auditOrderIndex = index;
        selectHold(nextHold);
        zoomToHold();
        startEdit();
    }

    function setAuditSelectedHoldByIndex(nextIndex) {
        if (!auditOrder.length) return;
        auditOrderIndex = (nextIndex + auditOrder.length) % auditOrder.length;
        const nextHold = auditOrder[auditOrderIndex];
        const panel = document.getElementById('edit-panel');
        if (panel.style.display === 'block' && selectedHoldId) {
            saveEdit(true).finally(() => {
                selectHold(nextHold, true);
                zoomToHold();
                startEdit();
            });
            return;
        }
        selectHold(nextHold, true);
        zoomToHold();
    }

    function focusAuditField(step) {
        const panel = document.getElementById('edit-panel');
        if (panel.style.display !== 'block') return;
        auditFieldIndex = (auditFieldIndex + step + auditFields.length) % auditFields.length;
        const field = document.getElementById(auditFields[auditFieldIndex]);
        if (field) field.focus();
    }

    function adjustAuditField(delta) {
        const field = document.getElementById(auditFields[auditFieldIndex]);
        if (!field) return;
        if (field.tagName === 'SELECT') {
            const nextIndex = (field.selectedIndex + delta + field.options.length) % field.options.length;
            field.selectedIndex = nextIndex;
            field.dispatchEvent(new Event('change', { bubbles: true }));
            commitAuditEdits();
            return;
        }
        if (field.type === 'number') {
            const min = field.min !== '' ? Number(field.min) : -Infinity;
            const max = field.max !== '' ? Number(field.max) : Infinity;
            const step = field.step !== '' && field.step !== 'any' ? Number(field.step) : 1;
            const current = Number(field.value || 0);
            field.value = String(Math.max(min, Math.min(max, current + step * delta)));
            field.dispatchEvent(new Event('input', { bubbles: true }));
            commitAuditEdits();
            return;
        }
    }

    function commitAuditEdits() {
        if (currentTool !== 'audit' || !selectedHoldId) return;
        const panel = document.getElementById('edit-panel');
        if (panel.style.display !== 'block') return;
        saveEdit(true);
    }

    function toggleMode(m) {
        const previousTool = currentTool;
        if (currentTool === m) currentTool = 'none';
        else currentTool = m;
        clickQueue = [];
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`btn-${currentTool}`);
        if (btn) btn.classList.add('active');
        mStatus.innerText = `MODE: ${currentTool.toUpperCase()}`;
        
        document.getElementById('set-type-controls').style.display = (currentTool === 'manual-set' || currentTool === 'ai-set') ? 'block' : 'none';
        document.getElementById('ai-controls').style.display = (currentTool === 'ai-set') ? 'block' : 'none';
        document.getElementById('setup-management-box').style.display = (currentTool === 'manual-set' || currentTool === 'ai-set' || currentTool === 'audit' || activeRoute) ? 'none' : 'block';
        document.getElementById('view-controls-box').style.display = currentTool === 'audit' ? 'none' : 'block';
        document.getElementById('measurement-tools-box').style.display = currentTool === 'audit' ? 'none' : 'block';
        document.getElementById('route-setting-box').style.display = currentTool === 'audit' ? 'none' : 'block';
        document.getElementById('audit-summary').style.display = currentTool === 'audit' ? 'block' : 'none';
        document.getElementById('btn-audit-jump').style.display = currentTool === 'audit' ? 'block' : 'none';
        
        if (currentTool === 'manual-set' && !activeRoute) createNewRoute();
        if (currentTool === 'audit') {
            updateAuditProgress();
            if (previousTool !== 'audit' && auditOrder.length) {
                jumpToNextUntransferredHold();
            }
        }

        let cursorClass = '';
        if (currentTool === 'measure' || currentTool === 'boundary' || currentTool === 'calibrate' || currentTool === 'ai-set') cursorClass = 'measuring';
        else if (currentTool === 'clear') cursorClass = 'clearing';
        viewport.className = `viewport ${cursorClass}`;
        
        if (currentTool === 'calibrate') status.innerText = "CLICK START POINT";
        else if (currentTool === 'boundary') status.innerText = "CLICK TO ADD BOUNDARY POINTS";
        else if (currentTool === 'manual-set') status.innerText = "ROUTE SETTING MODE";
        else if (currentTool === 'ai-set') status.innerText = "AI GENERATION MODE";
        else status.innerText = "WALL WORKSPACE";
        
        updateAuditProgress();
        render();
    }

    function isPointInPoly(pt, poly) {
        if (!poly.length) return true;
        let isInside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            if (((poly[i].y > pt.y) !== (poly[j].y > pt.y)) &&
                (pt.x < (poly[j].x - poly[i].x) * (pt.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)) {
                isInside = !isInside;
            }
        }
        return isInside;
    }

    function generateAIRoute() {
        if (window.generateTraverseRoute) {
            const ctx = {
                holds, richMetadata, catMapFull, boundaryPoints, pixelsToMeters,
                height: parseFloat(document.getElementById('ai-height').value),
                wingspan: parseFloat(document.getElementById('ai-wingspan').value),
                targetLen: parseFloat(document.getElementById('ai-length').value),
                targetGradeNum: parseInt(document.getElementById('ai-grade').value.replace('V', '')),
                targetGradeStr: document.getElementById('ai-grade').value,
                allowedCats: [],
                setActiveRoute: (route) => {
                    activeRoute = route;
                    document.getElementById('route-name-input').value = activeRoute.name;
                    document.getElementById('route-grade-input').value = activeRoute.grade;
                },
                render
            };
            if (document.getElementById('ai-cat-c').checked) ctx.allowedCats.push('C');
            if (document.getElementById('ai-cat-i').checked) ctx.allowedCats.push('I');
            if (document.getElementById('ai-cat-f').checked) ctx.allowedCats.push('F');
            
            window.generateTraverseRoute(ctx);
        } else {
            alert("AI Route Generator not loaded yet. Please wait a moment.");
        }
    }

    function toggleDrawFlow() { alert("Flow Drawing coming soon!"); }

    function render() {
        svg.innerHTML = '';
        updateSetupLists();
        updateRouteList();
        updateActiveRouteHoldList();
        
        // 1. Boundary / Support Lines (Hide if route active or in Route Setting/AI Mode)
        if (boundaryPoints.length > 0 && !activeRoute && currentTool !== 'manual-set' && currentTool !== 'ai-set') {
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            const pointsStr = boundaryPoints.map(p => `${p.x},${p.y}`).join(' ');
            poly.setAttribute('points', pointsStr);
            poly.setAttribute('fill', 'rgba(0, 122, 204, 0.2)');
            poly.setAttribute('stroke', '#007acc');
            poly.setAttribute('stroke-width', '4');
            if (currentTool !== 'boundary') poly.setAttribute('stroke-dasharray', '10,5');
            svg.appendChild(poly);
            
            if (currentTool === 'boundary') {
                boundaryPoints.forEach((p, i) => {
                    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    circle.setAttribute('cx', p.x); circle.setAttribute('cy', p.y);
                    circle.setAttribute('r', '8'); circle.setAttribute('fill', 'white');
                    circle.setAttribute('stroke', '#007acc');
                    circle.style.cursor = 'pointer';
                    circle.onclick = (e) => {
                        e.stopPropagation();
                        boundaryPoints.splice(i, 1);
                        saveAnnotations();
                    };
                    svg.appendChild(circle);
                });
            }
        }

        // 2. Holds
        let routeHoldLabels = {};
        let labelNodes = [];
        if (activeRoute && activeRoute.order) {
            let counts = { 1: 0, 2: 0, 3: 0 };
            activeRoute.order.forEach(id => {
                const t = activeRoute.holds[id];
                if (t === 1) { counts[1]++; routeHoldLabels[id] = `S${counts[1]}`; }
                else if (t === 2) { counts[2]++; routeHoldLabels[id] = `${counts[2]}`; }
                else if (t === 3) { counts[3]++; routeHoldLabels[id] = `F${counts[3]}`; }
                else if (t === 4) { routeHoldLabels[id] = `Top`; }
            });
            if (counts[1] === 1) {
                const sId = activeRoute.order.find(id => activeRoute.holds[id] === 1);
                if (sId) routeHoldLabels[sId] = 'S';
            }
        }

        if (currentTool !== 'calibrate') {
            holds.forEach(h => {
                const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                p.setAttribute('d', h.path);
                p.setAttribute('class', `hold-path cat-${h.cat}`);
                
                const isSelected = h.id === selectedHoldId;
                const isMeasuringFirst = clickQueue.length === 1 && clickQueue[0].id === h.id;
                const routeType = activeRoute?.holds[h.id];

                if (currentTool === 'boundary') {
                    p.style.strokeOpacity = '0.3';
                    p.style.fill = 'transparent';
                    p.style.pointerEvents = 'none';
                } else if (currentTool === 'audit') {
                    p.style.strokeOpacity = isSelected ? '1' : '0.55';
                    p.style.fill = 'transparent';
                    p.style.stroke = isSelected ? '#ff4dff' : '#9a9a9a';
                    p.style.strokeWidth = isSelected ? '12' : '5';
                } else if (appMode === 'messy' || isSelected || isMeasuringFirst || routeType) {
                    p.style.strokeOpacity = '1';
                    p.style.fill = (isSelected || isMeasuringFirst) ? 'transparent' : colors[h.cat] + "40"; 
                    if (routeType) {
                        p.style.stroke = typeColors[routeType];
                        p.style.strokeWidth = '12';
                        p.style.fill = 'transparent';
                        p.style.filter = 'drop-shadow(0 0 8px ' + typeColors[routeType] + ')';
                    }
                } else {
                    p.style.strokeOpacity = '0'; p.style.fill = 'transparent';
                }
                
                if (isSelected || isMeasuringFirst) p.classList.add('highlight');
                
                if (currentTool === 'manual-set' || currentTool === 'ai-set') {
                    p.onclick = (e) => { e.stopPropagation(); handleRouteHoldClick(h.id); };
                } else if (currentTool === 'audit') {
                    p.style.cursor = 'pointer';
                    p.onclick = (e) => { e.stopPropagation(); selectHold(h); };
                } else if (currentTool === 'measure') {
                    p.onmouseenter = () => p.classList.add('glow');
                    p.onmouseleave = () => p.classList.remove('glow');
                    p.onclick = (e) => { e.stopPropagation(); handleMeasureClick(h.center, h.id); };
                } else if (currentTool === 'clear') {
                    p.onclick = (e) => { e.stopPropagation(); measurements = measurements.filter(m => m.h1Id !== h.id && m.h2Id !== h.id); saveMeasurements(); };
                } else if (currentTool === 'none') {
                    p.onclick = (e) => { e.stopPropagation(); selectHold(h); };
                }
                
                svg.appendChild(p);

                if (routeType && routeHoldLabels[h.id]) {
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    let ly = h.center.y - 30; // Above hold
                    if (ly < 40) ly = h.center.y + 40; // Avoid top edge cut-off
                    text.setAttribute('x', h.center.x);
                    text.setAttribute('y', ly);
                    text.setAttribute('class', 'route-hold-label');
                    text.setAttribute('text-anchor', 'middle');
                    text.textContent = routeHoldLabels[h.id];
                    labelNodes.push(text);
                }
            });
            
            labelNodes.forEach(t => svg.appendChild(t));
        }

        // 3. Calibration (Hide in route modes)
        if (!activeRoute && currentTool !== 'manual-set' && currentTool !== 'ai-set') {
            calibrationData.forEach(c => {
                if (!c.p1 || !c.p2 || typeof c.p1.x === 'undefined') return;
                const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
                const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
                l.setAttribute('x1', c.p1.x); l.setAttribute('y1', c.p1.y); l.setAttribute('x2', c.p2.x); l.setAttribute('y2', c.p2.y);
                l.setAttribute('class', 'calib-line');
                group.appendChild(l);
                [c.p1, c.p2].forEach(p => {
                    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
                    dot.setAttribute('r', '5'); dot.setAttribute('class', 'calib-dot');
                    group.appendChild(dot);
                });
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute('x', (c.p1.x + c.p2.x)/2); text.setAttribute('y', (c.p1.y + c.p2.y)/2 - 10);
                text.setAttribute('class', 'calib-text');
                text.textContent = `${c.lengthMeters}m`;
                group.appendChild(text);
                svg.appendChild(group);
            });
        }

        // 4. Assisted Lines and Ideal Line
        if (activeRoute && activeRoute.idealLine) {
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute('x1', activeRoute.idealLine.p1.x); line.setAttribute('y1', activeRoute.idealLine.p1.y);
            line.setAttribute('x2', activeRoute.idealLine.p2.x); line.setAttribute('y2', activeRoute.idealLine.p2.y);
            line.setAttribute('stroke', 'rgba(255, 100, 255, 0.5)'); // Pinkish semi-transparent
            line.setAttribute('stroke-width', '15');
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('pointer-events', 'none');
            group.appendChild(line);
            
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute('x', (activeRoute.idealLine.p1.x + activeRoute.idealLine.p2.x)/2);
            text.setAttribute('y', (activeRoute.idealLine.p1.y + activeRoute.idealLine.p2.y)/2 - 15);
            text.setAttribute('fill', '#ff64ff');
            text.setAttribute('font-family', 'monospace');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('pointer-events', 'none');
            text.textContent = "AI DESIRED FLOW";
            group.appendChild(text);
            
            svg.appendChild(group);
        }

        if (activeRoute && activeRoute.order && activeRoute.order.length > 1) {
            const filteredOrder = activeRoute.order.filter(id => activeRoute.holds[id] !== 3);
            for (let i = 0; i < filteredOrder.length - 1; i++) {
                const h1 = holds.find(x => x.id === filteredOrder[i]);
                const h2 = holds.find(x => x.id === filteredOrder[i+1]);
                if (!h1 || !h2) continue;
                const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute('x1', h1.center.x); line.setAttribute('y1', h1.center.y);
                line.setAttribute('x2', h2.center.x); line.setAttribute('y2', h2.center.y);
                line.setAttribute('class', 'assisted-line');
                group.appendChild(line);
                const distPx = Math.hypot(h1.center.x - h2.center.x, h1.center.y - h2.center.y);
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute('x', (h1.center.x + h2.center.x)/2); text.setAttribute('y', (h1.center.y + h2.center.y)/2 - 5);
                text.setAttribute('class', 'route-dist-text');
                text.textContent = `${pixelsToMeters(distPx).toFixed(2)}m`;
                group.appendChild(text);
                svg.appendChild(group);
            }
        }

        // 5. Measurements
        if (currentTool !== 'boundary' && !activeRoute && currentTool !== 'manual-set' && currentTool !== 'ai-set') {
            measurements.forEach((m, idx) => {
                let p1, p2;
                if (m.p1 && m.p2) { p1 = m.p1; p2 = m.p2; }
                else {
                    const h1 = holds.find(x => x.id === m.h1Id), h2 = holds.find(x => x.id === m.h2Id);
                    if (!h1 || !h2) return;
                    p1 = h1.center; p2 = h2.center;
                }
                const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
                line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
                line.setAttribute('class', 'measure-line');
                if (selectedLinkId === idx) line.style.strokeOpacity = "1";
                line.onclick = (e) => {
                    e.stopPropagation();
                    if (currentTool === 'clear') { measurements.splice(idx, 1); saveMeasurements(); return; }
                };
                group.appendChild(line);
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute('x', (p1.x + p2.x)/2); text.setAttribute('y', (p1.y + p2.y)/2 - 10);
                text.setAttribute('class', 'measure-text');
                text.textContent = `${m.distM != null ? m.distM.toFixed(3) : "?.???"}m`;
                group.appendChild(text);
                svg.appendChild(group);
            });
        }
        
        clickQueue.forEach(p => {
            const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
            c.setAttribute('r', '6'); c.setAttribute('class', 'click-dot');
            svg.appendChild(c);
        });
    }

    function updateSetupLists() {
        const bList = document.getElementById('boundary-list');
        const cList = document.getElementById('calibration-list');
        bList.innerHTML = boundaryPoints.length ? '' : '<div style="padding:10px; color:#666; font-style:italic;">No boundary points</div>';
        boundaryPoints.forEach((p, i) => {
            const item = document.createElement('div');
            item.className = 'setup-item';
            item.innerHTML = `<span>Point ${i+1}: ${Math.round(p.x)},${Math.round(p.y)}</span><span class="delete-small" onclick="event.stopPropagation(); boundaryPoints.splice(${i}, 1); saveAnnotations();">DEL</span>`;
            bList.appendChild(item);
        });
        cList.innerHTML = calibrationData.length ? '' : '<div style="padding:10px; color:#666; font-style:italic;">No calibrations</div>';
        calibrationData.forEach((c, i) => {
            const item = document.createElement('div');
            item.className = 'setup-item';
            item.innerHTML = `<span>Dist: ${c.lengthMeters}m</span><span class="delete-small" onclick="event.stopPropagation(); calibrationData.splice(${i}, 1); saveCalibration();">DEL</span>`;
            cList.appendChild(item);
        });
    }

    function updateRouteList() {
        const rList = document.getElementById('route-list');
        rList.innerHTML = allRoutes.length ? '' : '<div style="padding:10px; color:#666; font-style:italic; text-align:center;">No routes saved</div>';
        allRoutes.forEach((r, idx) => {
            const item = document.createElement('div');
            item.className = `route-item ${activeRoute?.name === r.name ? 'active' : ''}`;
            const stats = { 1: 0, 2: 0, 3: 0, 4: 0 };
            Object.values(r.holds).forEach(t => stats[t]++);
            item.onclick = () => { activeRoute = r; render(); };
            item.innerHTML = `
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:12px;">${r.name} (${r.grade || '?'})</div>
                    <div style="display:flex; gap:4px; margin-top:4px;">
                        <span class="type-indicator" style="background:${typeColors[1]};"></span>${stats[1]}
                        <span class="type-indicator" style="background:${typeColors[2]};"></span>${stats[2]}
                        <span class="type-indicator" style="background:${typeColors[3]};"></span>${stats[3]}
                        <span class="type-indicator" style="background:${typeColors[4]};"></span>${stats[4]}
                    </div>
                </div>
                <div style="display:flex; align-items:center;">
                    <span class="edit-small" onclick="event.stopPropagation(); editRoute(${idx});">EDIT</span>
                    <span class="delete-small" onclick="event.stopPropagation(); allRoutes.splice(${idx}, 1); saveAllRoutes();">DEL</span>
                </div>
            `;
            rList.appendChild(item);
        });
    }

    function updateActiveRouteHoldList() {
        const list = document.getElementById('route-holds-list');
        if (!activeRoute) {
            list.innerHTML = '<div style="padding:10px; color:#666; font-style:italic;">No active route</div>';
            return;
        }
        list.innerHTML = activeRoute.order?.length ? '' : '<div style="padding:10px; color:#666; font-style:italic;">No holds in route</div>';
        activeRoute.order?.forEach((holdId, i) => {
            const h = holds.find(x => x.id === holdId);
            const type = activeRoute.holds[holdId];
            const [x, y] = h.cell.split(',').map(n => parseInt(n) + 1);
            const id5 = `${h.cat}${x}${y}${h.num.toString().padStart(2, '0')}`;
            const item = document.createElement('div');
            item.className = 'setup-item';
            item.style.cursor = 'pointer';
            item.onclick = () => { selectHold(h); };
            item.innerHTML = `
                <span style="color:${typeColors[type]}">${i+1}. ${typeNames[type]} (${id5})</span>
                <div>
                    <span class="edit-small" onclick="event.stopPropagation(); selectedHoldId='${h.id}'; startEdit();">EDIT</span>
                    <span class="delete-small" onclick="event.stopPropagation(); handleRouteHoldClick('${holdId}', true);">DEL</span>
                </div>
            `;
            list.appendChild(item);
        });
        const startHolds = activeRoute.order?.filter(id => activeRoute.holds[id] === 1).map(id => holds.find(x => x.id === id));
        const endHolds = activeRoute.order?.filter(id => activeRoute.holds[id] === 4).map(id => holds.find(x => x.id === id));
        if (startHolds?.length && endHolds?.length) {
            let maxDistPx = 0;
            startHolds.forEach(s => {
                endHolds.forEach(e => {
                    const d = Math.hypot(s.center.x - e.center.x, s.center.y - e.center.y);
                    if (d > maxDistPx) maxDistPx = d;
                });
            });
            document.getElementById('route-dist-calc').innerText = `${pixelsToMeters(maxDistPx).toFixed(2)}m`;
        } else {
            document.getElementById('route-dist-calc').innerText = `0.00m`;
        }
    }

    function createNewRoute() {
        activeRoute = { name: `Route ${allRoutes.length + 1}`, grade: 'V0', holds: {}, order: [] };
        document.getElementById('route-name-input').value = activeRoute.name;
        document.getElementById('route-grade-input').value = activeRoute.grade;
        settingType = 1;
        toggleMode('manual-set');
        render();
    }

    function editRoute(idx) {
        activeRoute = JSON.parse(JSON.stringify(allRoutes[idx]));
        document.getElementById('route-name-input').value = activeRoute.name || '';
        document.getElementById('route-grade-input').value = activeRoute.grade || 'V0';
        toggleMode('manual-set');
        render();
    }

    function setSettingType(t) {
        settingType = t;
        document.querySelectorAll('#set-type-controls .mode-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`btn-type-${t}`);
        if (btn) btn.classList.add('active');
        else if (t === 5) document.getElementById('btn-type-5').classList.add('active');
    }

    function handleRouteHoldClick(holdId, forceRemove = false) {
        if (!activeRoute) return;
        if (!activeRoute.order) activeRoute.order = [];
        const currentTypeOnHold = activeRoute.holds[holdId];
        if (forceRemove || settingType === 5 || currentTypeOnHold === settingType) {
            delete activeRoute.holds[holdId];
            activeRoute.order = activeRoute.order.filter(id => id !== holdId);
        } else {
            activeRoute.holds[holdId] = settingType;
            if (!activeRoute.order.includes(holdId)) { activeRoute.order.push(holdId); }
            if (settingType === 1) {
                const startCount = Object.values(activeRoute.holds).filter(t => t === 1).length;
                if (startCount >= 2) setSettingType(2);
            }
        }
        render();
    }

    async function saveActiveRoute() {
        if (!activeRoute) return;
        activeRoute.name = document.getElementById('route-name-input').value.trim();
        activeRoute.grade = document.getElementById('route-grade-input').value;
        const existingIdx = allRoutes.findIndex(r => r.name === activeRoute.name);
        if (existingIdx >= 0) allRoutes[existingIdx] = activeRoute;
        else allRoutes.push(activeRoute);
        await saveAllRoutes();
        toggleMode('none');
        status.innerText = "ROUTE SAVED";
        
        // Show test log panel after saving a route
        document.getElementById('test-log-panel').style.display = 'block';
    }

    async function submitTestLog() {
        if (!activeRoute) return;
        const feedback = {
            timestamp: new Date().toISOString(),
            routeName: activeRoute.name,
            setGrade: activeRoute.grade,
            userGradeMatch: document.getElementById('test-grade-match').value,
            userFlowRating: document.getElementById('test-flow').value,
            notes: document.getElementById('test-notes').value,
            routeData: activeRoute // Include full route for training
        };

        status.innerText = "SAVING FEEDBACK...";
        try {
            await fetch('/save_auto_log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'feedback', data: feedback })
            });
            status.innerText = "FEEDBACK SAVED!";
            document.getElementById('test-log-panel').style.display = 'none';
        } catch(e) {
            status.innerText = "ERROR SAVING";
        }
    }

    async function saveAllRoutes() {
        await fetch('/save_routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(allRoutes) });
        render();
    }

    function selectHold(h, fromAuditNav = false) {
        selectedHoldId = h.id; selectedLinkId = null;
        document.getElementById('hold-details').style.display = 'block';
        document.getElementById('edit-panel').style.display = 'none';
        document.getElementById('link-details').style.display = 'none';
        const resolved = getHoldSpecForHold(h);
        const meta = resolved.meta;
        const [x, y] = h.cell.split(',').map(n => parseInt(n) + 1);
        const id5 = `${h.cat}${x}${y}${h.num.toString().padStart(2, '0')}`;
        const t1 = h.cat === 'C' ? 'Rd' : (h.cat === 'F' ? 'Sm' : 'Bg');
        const t2 = typeShorthand[resolved.type?.toLowerCase()] || 'Un';
        const diff = (resolved.baseDifficulty || '0').toString().padStart(2, '0');
        const handDiff = (resolved.handDifficulty || '0').toString().padStart(2, '0');
        const clock = clockMap[parseInt(resolved.direction)] || '06';
        document.getElementById('val-id-5').innerText = id5;
        document.getElementById('val-desc-8').innerText = `${t1}${t2}${diff}${clock}`;
        document.getElementById('val-id-cat').innerText = h.cat;
        document.getElementById('val-id-cell').innerText = h.cell;
        document.getElementById('val-id-num').innerText = h.num;
        document.getElementById('val-all-details').innerText = `${resolved.type} / Base ${resolved.baseDifficulty} / Hand ${handDiff} / Foot ${resolved.footLabel} / ${resolved.direction}° / ${resolved.idealUsage || meta.idealUsage || meta.ideal || "General"}`;
        if (currentTool === 'audit' && !fromAuditNav) {
            const holdIndex = auditOrder.findIndex(item => item.id === h.id);
            if (holdIndex >= 0) auditOrderIndex = holdIndex;
            zoomToHold();
        }
        updateAuditProgress();
        render();
    }

    function handleMeasureClick(pt, holdId = null) {
        const point = { x: pt.x, y: pt.y, id: holdId };
        clickQueue.push(point);
        if (clickQueue.length === 1) { status.innerText = "SELECT SECOND POINT"; render(); }
        else {
            const p1 = clickQueue[0], p2 = clickQueue[1];
            const distPx = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            measurements.push({ h1Id: p1.id, h2Id: p2.id, p1: {x: p1.x, y: p1.y}, p2: {x: p2.x, y: p2.y}, distM: pixelsToMeters(distPx) });
            saveMeasurements(); toggleMode('none');
        }
    }

    function pixelsToMeters(px) {
        if (!calibrationData.length) return px / 500;
        let sumScale = 0;
        calibrationData.forEach(c => { const pxDist = Math.hypot(c.p1.x - c.p2.x, c.p1.y - c.p2.y); sumScale += (c.lengthMeters / pxDist); });
        return px * (sumScale / calibrationData.length);
    }

    function getHoldSpecForHold(h) {
        const fullCat = catMapFull[h.cat];
        const meta = (richMetadata[h.cell] || {})[`${fullCat}${h.num}`] || {};
        const spec = holdSpec.find(s => String(s.id) === String(h.id) || (s.cell === h.cell && s.cat === h.cat && Number(s.num) === Number(h.num))) || {};
        const baseDifficulty = spec.baseDifficulty ?? parseInt(meta.difficulty || '1', 10);
        const handDifficulty = spec.handDifficulty ?? parseInt(meta.handDifficulty || String(baseDifficulty * 2), 10);
        const footDifficulty = spec.footDifficulty ?? parseInt(meta.footDifficulty || String(Math.max(1, Math.min(10, (spec.footRating ?? parseInt(meta.footRating || '3', 10)) * 2))), 10);
        const generalUsability = spec.generalUsability ?? parseInt(meta.generalUsability || '5', 10);
        const idealUsage = spec.idealUsage ?? meta.idealUsage ?? meta.ideal ?? 'General';
        const footRating = spec.footRating ?? parseInt(meta.footRating || String(Math.max(1, Math.min(5, Math.round(footDifficulty / 2)))), 10);
        return {
            meta,
            spec,
            baseDifficulty,
            handDifficulty,
            footDifficulty,
            footRating,
            generalUsability,
            footLabel: ['Heaven', 'Good', 'Mid', 'Bad', 'Hell'][Math.max(0, Math.min(4, footRating - 1))],
            direction: spec.direction ?? parseInt(meta.direction || '180', 10),
            idealUsage,
            type: spec.type || meta.type || 'uncategorized'
        };
    }

    async function saveMeasurements() { await fetch('/save_measurements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(measurements) }); render(); }
    async function saveCalibration() { await fetch('/save_calibration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calibrationData) }); render(); }
    async function saveAnnotations() { await fetch('/save_annotations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(boundaryPoints) }); render(); }

    svg.onclick = (e) => {
        if (currentTool === 'none' || document.getElementById('edit-panel').style.display === 'block') {
            selectedHoldId = null; selectedLinkId = null;
            document.getElementById('hold-details').style.display = 'none';
            document.getElementById('link-details').style.display = 'none';
            render(); return;
        }
        const pt = getSVGPoint(e);
        if (currentTool === 'boundary') { boundaryPoints.push(pt); saveAnnotations(); return; }
        if (currentTool === 'measure') { handleMeasureClick(pt); return; }
        if (currentTool === 'calibrate') {
            clickQueue.push(pt); render();
            if (clickQueue.length === 1) { status.innerText = "CLICK END POINT"; }
            else {
                const m = prompt("Distance (m):", "1.0");
                if (m) { calibrationData.push({ p1: clickQueue[0], p2: clickQueue[1], lengthMeters: parseFloat(m) }); saveCalibration(); }
                toggleMode('none'); status.innerText = "CALIBRATED";
            }
        }
    };

    function getSVGPoint(e) { 
        const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; 
        const transformed = pt.matrixTransform(svg.getScreenCTM().inverse());
        return { x: transformed.x, y: transformed.y };
    }

    function chooseRandomHold() { if (!holds.length) return; const r = holds[Math.floor(Math.random() * holds.length)]; selectHold(r); }
    function zoomToHold() { const h = holds.find(x => x.id === selectedHoldId); if (!h) return; const vRect = viewport.getBoundingClientRect(); scale = 2.0; translateX = vRect.width/2 - h.center.x * scale; translateY = vRect.height/2 - h.center.y * scale; updateTransform(); }

    function startEdit() { 
        const h = holds.find(x => x.id === selectedHoldId); if (!h) return;
        document.getElementById('hold-details').style.display = 'none'; document.getElementById('edit-panel').style.display = 'block';
        const resolved = getHoldSpecForHold(h);
        const meta = resolved.meta;
        document.getElementById('edit-cell').value = h.cell; document.getElementById('edit-cat').value = h.cat; document.getElementById('edit-num').value = h.num;
        document.getElementById('edit-type').value = resolved.type || "uncategorized";
        document.getElementById('edit-grab').value = String(resolved.direction || 180);
        document.getElementById('edit-hand-diff').value = String(resolved.handDifficulty || Math.min(10, (resolved.baseDifficulty || 1) * 2));
        document.getElementById('edit-foot-diff').value = String(resolved.footDifficulty || Math.min(10, Math.max(1, (resolved.footRating || 3) * 2)));
        document.getElementById('edit-general-usability').value = String(resolved.generalUsability || 5);
        document.getElementById('edit-ideal').value = resolved.idealUsage || meta.idealUsage || meta.ideal || "General";
        document.getElementById('hold-details').style.display = 'block';
        document.getElementById('audit-toast').style.display = 'none';
        auditFieldIndex = 0;
        setTimeout(() => {
            const firstField = document.getElementById(auditFields[0]);
            if (firstField) firstField.focus();
        }, 0);
    }
    function cancelEdit() { document.getElementById('edit-panel').style.display = 'none'; document.getElementById('hold-details').style.display = 'block'; }
    async function saveEdit(silent = false) {
        const h = holds.find(x => x.id === selectedHoldId);
        const oldCell = h.cell, oldCat = h.cat, oldNum = h.num, oldKey = `${catMapFull[oldCat]}${oldNum}`;
        const newCell = document.getElementById('edit-cell').value.trim(), newCat = document.getElementById('edit-cat').value, newNum = parseInt(document.getElementById('edit-num').value);
        h.cell = newCell; h.cat = newCat; h.num = newNum;
        if (richMetadata[oldCell]) delete richMetadata[oldCell][oldKey];
        if (!richMetadata[newCell]) richMetadata[newCell] = {};
        const newKey = `${catMapFull[newCat]}${newNum}`;
        const handDifficulty = document.getElementById('edit-hand-diff').value;
        const footDifficulty = document.getElementById('edit-foot-diff').value;
        const generalUsability = document.getElementById('edit-general-usability').value;
        const idealUsage = document.getElementById('edit-ideal').value;
        const typeValue = document.getElementById('edit-type').value.trim() || 'uncategorized';
        richMetadata[newCell][newKey] = { cell_x: parseInt(newCell.split(',')[0]), cell_y: parseInt(newCell.split(',')[1]), category: catMapFull[newCat], num: newNum.toString(), type: typeValue, difficulty: String(Math.max(1, Math.min(5, Math.round(Number(handDifficulty) / 2)))), handDifficulty, footDifficulty, footRating: String(Math.max(1, Math.min(5, Math.round(Number(footDifficulty) / 2)))), generalUsability, direction: document.getElementById('edit-grab').value, idealUsage, ideal: idealUsage };
        if (holdSpec.length) {
            const existing = holdSpec.find(spec => String(spec.id) === String(h.id) || (spec.cell === oldCell && spec.cat === oldCat && Number(spec.num) === Number(oldNum)));
            if (existing) {
                existing.cell = newCell;
                existing.cat = newCat;
                existing.num = newNum;
                existing.type = typeValue;
                existing.baseDifficulty = Math.max(1, Math.min(5, Math.round(Number(handDifficulty) / 2)));
                existing.handDifficulty = Number(handDifficulty);
                existing.footDifficulty = Number(footDifficulty);
                existing.footRating = Math.max(1, Math.min(5, Math.round(Number(footDifficulty) / 2)));
                existing.generalUsability = Number(generalUsability);
                existing.footLabel = ['Heaven', 'Good', 'Mid', 'Bad', 'Hell'][Math.max(0, Math.min(4, Math.round(Number(footDifficulty) / 2) - 1))];
                existing.direction = Number(document.getElementById('edit-grab').value);
                existing.directionLabel = clockMap[existing.direction] ? clockMap[existing.direction] : String(existing.direction);
                existing.idealUsage = idealUsage;
                existing.ideal = idealUsage;
            }
        }
        markHoldTransferred(h);
        setAuditToast(`Hold ${h.num} in cell ${oldCell} edited: ${typeValue}, hand ${handDifficulty}/10, feet ${footDifficulty}/10, usability ${generalUsability}/10`);
        status.innerText = silent ? "AUTO-SAVING..." : "SAVING...";
        try {
            await fetch('/save_full_edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holds: holds, metadata: richMetadata }) });
            status.innerText = silent ? "AUTO-SAVED!" : "SAVED!";
            updateAuditProgress();
            if (!silent) {
                cancelEdit();
                selectHold(h);
            }
        } catch(e) {
            status.innerText = "ERROR";
        }
    }

    function setMode(m) { appMode = m; document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active')); document.getElementById(`mode-${m}`).classList.add('active'); render(); }

    function updateAuditProgress() {
        const progress = document.getElementById('audit-progress');
        const summary = document.getElementById('audit-summary');
        if (!progress) return;
        if (currentTool !== 'audit') {
            progress.style.display = 'none';
            if (summary) summary.style.display = 'none';
            return;
        }
        const total = holdSpec.length || holds.length;
        const remaining = auditOrder.filter(h => !isHoldTransferred(h)).length;
        progress.style.display = 'block';
        progress.textContent = `${remaining} / ${total} holds not yet transferred`;
        if (summary) {
            summary.style.display = 'block';
            summary.innerHTML = `<div>${remaining} hold${remaining === 1 ? '' : 's'} not yet transferred</div><div style="margin-top:4px; color:#aaa;">Order: cell -> type -> num</div>`;
        }
    }

    function setAuditToast(message) {
        const toast = document.getElementById('audit-toast');
        if (!toast) return;
        toast.style.display = 'block';
        toast.textContent = message;
        clearTimeout(window.__auditToastTimer);
        window.__auditToastTimer = setTimeout(() => {
            toast.style.display = 'none';
        }, 2500);
    }

