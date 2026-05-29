export interface Hold {
    id: string;
    cat: string;
    num: number;
    cell: string;
    center: { x: number, y: number };
}

export interface HoldSpec {
    id: string | number;
    cell: string;
    cat: string;
    num: number;
    type: string;
    baseDifficulty: number;
    handDifficulty: number;
    footRating: number;
    footLabel: string;
    direction: number;
    directionLabel: string;
    center: { x: number, y: number };
    boxSize: number;
}

export interface RouteContext {
    holds: Hold[];
    richMetadata: any;
    catMapFull: any;
    holdSpec?: HoldSpec[];
    boundaryPoints: { x: number, y: number }[];
    pixelsToMeters: (px: number) => number;
    height: number;
    wingspan: number;
    targetLen: number;
    targetGradeNum: number;
    targetGradeStr: string;
    allowedCats: string[];
    routeCount: number;
    holdDensity: number;
    setActiveRoute: (route: any) => void;
    render: () => void;
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function toNumber(value: any, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildHoldKey(h: Pick<Hold, 'id' | 'cell' | 'cat' | 'num'>) {
    return `${h.id}|${h.cell}|${h.cat}|${h.num}`;
}

function footLabelFromRating(rating: number) {
    const labels = ['Heaven', 'Good', 'Mid', 'Bad', 'Hell'];
    return labels[clamp(Math.round(rating), 1, 5) - 1];
}

function directionVector(direction: number) {
    const radians = direction * Math.PI / 180;
    return { x: Math.sin(radians), y: -Math.cos(radians) };
}

function directionLabel(direction: number) {
    const normalized = ((Math.round(direction) % 360) + 360) % 360;
    const labels: Record<number, string> = {
        0: 'up',
        45: 'up-right',
        90: 'right',
        135: 'down-right',
        180: 'down',
        225: 'down-left',
        270: 'left',
        315: 'up-left'
    };
    return labels[normalized] || `${normalized}°`;
}

const WEIGHT_CONFIG = {
    route: {
        targetHandDifficultyBase: 2,
        targetHandDifficultySlope: 0.75,
        maxHandDifficulty: 10,
        maxMoveRatio: 1.02,
        idealMoveRatioMin: 0.4,
        idealMoveRatioMax: 0.85,
        idealMoveRatioCenter: 0.62,
        crampedMoveFloorRatio: 0.4,
        crampedMovePenaltyBase: 28,
        crampedMovePenaltyMultiplier: 260,
        longMovePenaltyBase: 65,
        longMovePenaltyMultiplier: 360,
        moveDirectionWeight: 18,
        gradeWeight: 9,
        lowGradeFavorMultiplier: 0.85,
        highGradePenaltyMultiplier: 1.1,
        lineWeightEarly: 6,
        lineWeightLate: 3,
        progressWeight: 28,
        shortMoveTriggerRatio: 0.4,
        shortMoveSpamBase: 40,
        shortMoveSpamGrowth: 2,
        shortMoveHardnessOffset: 4,
        startHeightMinMeters: 1.0,
        startHeightMaxMeters: 1.8,
        startPoolSizeMin: 12,
        startPoolBase: 10,
        startPoolDensityMultiplier: 30,
        startBiasExponent: 0.7,
        yLimitTopBaseMeters: 4.0,
        yLimitTopDensityMeters: 1.0,
        yLimitBottomBaseMeters: 0.15,
        yLimitBottomBufferMeters: 0.3,
        yLimitBottomDensityMeters: 0.12,
        minStepBaseMeters: 0.08,
        minStepDensityMeters: 0.08,
        maxStepWingspanMultiplier: 1.02,
        minForwardBaseMeters: 0.02,
        minForwardDensityMeters: 0.03,
        finishDropMinMeters: 0.12,
        finishDropTargetMeters: 0.28,
        finishDropDensityMeters: 0.05,
        finishFootDistanceWeightX: 6,
        finishFootDistanceWeightY: 3,
        finishFootQualityWeight: 12,
        finishFootQualityEasyTarget: 1.5,
        finishFootQualityMidTarget: 2.5,
        finishFootQualityHardTarget: 3.2,
        finishRecycleBonus: 18,
        finishSizeBonusLarge: 5,
        finishSizeBonusMid: 2,
        finishTypePenaltyEasy: 8,
        finishOppositeSideThreshold: 0.7,
        finishBodyYOffsetMeters: 0.32,
        finishSecondFootMinSpreadMeters: 0.18,
        finishSecondFootFavorUsedBonus: 10,
        footRecycleGradeThreshold: 3,
        footRecycleBonus: 18,
        footBodyYOffsetMeters: 0.32,
        footMinDropEasyMeters: 0.18,
        footMinDropHardMeters: 0.45,
        footMaxDropHardMeters: 1.7,
        footMaxDropMultiplier: 1.05,
        footFinalMinDropMeters: 0.12,
        footFinalTargetMeters: 0.28,
        footFinalDropDensityMeters: 0.05,
        footDistanceWeightX: 10,
        footDistanceWeightY: 5,
        footDistanceWeightXFinal: 6,
        footDistanceWeightYFinal: 3,
        footTypePenaltyEasy: 8,
        footSizeBonusLarge: 5,
        footSizeBonusMid: 2,
        footSearchJitter: 1.25,
        handSearchJitter: 1.5,
        scoreAlignmentMultiplier: 1,
        moveMaxReachRatio: 1.02
    }
} as const;

// Helper to check if point is in polygon
function isPointInPoly(pt: {x: number, y: number}, poly: {x: number, y: number}[]) {
    let isInside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i].x, yi = poly[i].y;
        let xj = poly[j].x, yj = poly[j].y;
        let intersect = ((yi > pt.y) !== (yj > pt.y))
            && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

export function generateTraverseRoute(ctx: RouteContext) {
    const { holds, richMetadata, catMapFull, holdSpec, boundaryPoints, pixelsToMeters, height, wingspan, targetLen, targetGradeNum, targetGradeStr, allowedCats, routeCount, holdDensity, setActiveRoute, render } = ctx;
    const density = Math.min(100, Math.max(1, holdDensity || 80));
    const densityFactor = density / 100;
    const holdSpecLookup = new Map<string, HoldSpec>();
    (holdSpec || []).forEach(spec => {
        holdSpecLookup.set(String(spec.id), spec);
        holdSpecLookup.set(`${spec.cell}|${spec.cat}|${spec.num}`, spec);
    });

    const gradeMap: Record<number, number> = { 1: 1, 2: 3, 3: 4, 4: 6, 5: 8 };

    function getHoldGrade(h: Hold) {
        const meta = (richMetadata[h.cell] || {})[`${catMapFull[h.cat]}${h.num}`] || {};
        const hDiff = clamp(toNumber(meta.difficulty, 1), 1, 5);
        const spec = resolveHoldSpec(h);
        return { diffNum: hDiff, grade: gradeMap[hDiff] || 0, handDifficulty: spec.handDifficulty, footRating: spec.footRating };
    }

    function resolveHoldSpec(h: Hold): HoldSpec {
        const meta = (richMetadata[h.cell] || {})[`${catMapFull[h.cat]}${h.num}`] || {};
        const cached = holdSpecLookup.get(String(h.id)) || holdSpecLookup.get(`${h.cell}|${h.cat}|${h.num}`);
        const baseDifficulty = clamp(toNumber(cached?.baseDifficulty ?? meta.difficulty, 1), 1, 5);
        const handDifficulty = clamp(toNumber(cached?.handDifficulty ?? meta.handDifficulty, baseDifficulty * 2), 1, 10);
        const footRating = clamp(toNumber(cached?.footRating ?? meta.footRating, inferFootRating(cached?.type ?? meta.type, baseDifficulty, handDifficulty, cached?.boxSize ?? 0)), 1, 5);
        const direction = clamp(toNumber(cached?.direction ?? meta.direction, 180), 0, 359);
        const spec: HoldSpec = {
            id: h.id,
            cell: h.cell,
            cat: h.cat,
            num: h.num,
            type: String(cached?.type ?? meta.type ?? 'uncategorized'),
            baseDifficulty,
            handDifficulty,
            footRating,
            footLabel: footLabelFromRating(footRating),
            direction,
            directionLabel: directionLabel(direction),
            center: h.center,
            boxSize: toNumber(cached?.boxSize ?? meta.boxSize, 0)
        };
        return spec;
    }

    function inferFootRating(type: any, baseDifficulty: number, handDifficulty: number, boxSize: number) {
        const t = String(type || '').toLowerCase();
        const sizeBonus = boxSize >= 90 ? -1 : boxSize >= 70 ? 0 : 1;
        if (t === 'jug') return clamp(1 + sizeBonus, 1, 5);
        if (t === 'sloper') return clamp(3 + sizeBonus, 1, 5);
        if (t === 'crimp' || t === 'jib' || t === 'pocket') return clamp(4 + sizeBonus + Math.max(0, baseDifficulty - 2), 1, 5);
        if (t === 'pinch') return clamp(3 + sizeBonus + Math.max(0, baseDifficulty - 3), 1, 5);
        return clamp(Math.round((handDifficulty / 2) + sizeBonus), 1, 5);
    }

    const candidates = holds.filter(h => allowedCats.includes(h.cat) && isPointInPoly(h.center, boundaryPoints));

    if (candidates.length < 5) {
        alert("Not enough suitable holds in boundary! Check if your boundary includes enough 'Climbing' holds.");
        return;
    }

    // Determine wall bounds in pixels
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    candidates.forEach(h => {
        if (h.center.x < minX) minX = h.center.x;
        if (h.center.x > maxX) maxX = h.center.x;
        if (h.center.y > maxY) maxY = h.center.y;
    });

    // Start 1.0m to 1.8m from the ground
    const yStartMin = maxY - (1.8 / pixelsToMeters(1));
    const yStartMax = maxY - (1.0 / pixelsToMeters(1));

    // Determine direction: Left to Right or Right to Left
    const isLeftToRight = Math.random() > 0.5;

    let heightCandidates = candidates.filter(h => h.center.y >= yStartMin && h.center.y <= yStartMax);
    if (heightCandidates.length === 0) heightCandidates = candidates;

    // Sort by proximity to the starting edge
    heightCandidates.sort((a, b) => isLeftToRight ? a.center.x - b.center.x : b.center.x - a.center.x);

    const targetHandDifficulty = clamp(
        WEIGHT_CONFIG.route.targetHandDifficultyBase + targetGradeNum * WEIGHT_CONFIG.route.targetHandDifficultySlope,
        WEIGHT_CONFIG.route.targetHandDifficultyBase,
        WEIGHT_CONFIG.route.maxHandDifficulty
    );

    function moveDistanceCost(distM: number) {
        const spanM = Math.max(0.01, wingspan);
        const ratio = distM / spanM;
        if (ratio > WEIGHT_CONFIG.route.maxMoveRatio) return Infinity;
        if (ratio >= WEIGHT_CONFIG.route.idealMoveRatioMin && ratio <= WEIGHT_CONFIG.route.idealMoveRatioMax) {
            return Math.pow(ratio - WEIGHT_CONFIG.route.idealMoveRatioCenter, 2) * 45;
        }
        if (ratio < WEIGHT_CONFIG.route.crampedMoveFloorRatio) {
            const cramped = WEIGHT_CONFIG.route.crampedMoveFloorRatio - ratio;
            return WEIGHT_CONFIG.route.crampedMovePenaltyBase + Math.pow(cramped, 2) * WEIGHT_CONFIG.route.crampedMovePenaltyMultiplier;
        }
        return WEIGHT_CONFIG.route.longMovePenaltyBase + Math.pow(ratio - WEIGHT_CONFIG.route.idealMoveRatioMax, 2) * WEIGHT_CONFIG.route.longMovePenaltyMultiplier;
    }

    function holdDirectionCost(spec: HoldSpec, dxM: number, dyM: number) {
        const moveLen = Math.hypot(dxM, dyM);
        if (!moveLen) return 0;
        const moveVec = { x: dxM / moveLen, y: dyM / moveLen };
        const holdVec = directionVector(spec.direction);
        const alignment = clamp(holdVec.x * moveVec.x + holdVec.y * moveVec.y, -1, 1);
        return (1 - alignment) * WEIGHT_CONFIG.route.moveDirectionWeight;
    }

    function gradeCost(spec: HoldSpec) {
        const diff = Math.abs(spec.handDifficulty - targetHandDifficulty);
        const gradeBias = targetGradeNum <= 2
            ? (spec.handDifficulty <= targetHandDifficulty ? WEIGHT_CONFIG.route.lowGradeFavorMultiplier : WEIGHT_CONFIG.route.highGradePenaltyMultiplier)
            : 1;
        return diff * WEIGHT_CONFIG.route.gradeWeight * gradeBias;
    }

    function lineCost(pt: { x: number, y: number }, idealLine: { p1: { x: number, y: number }, p2: { x: number, y: number } }, attempts: number) {
        const lineWeight = attempts > 15 ? WEIGHT_CONFIG.route.lineWeightLate : WEIGHT_CONFIG.route.lineWeightEarly;
        return pixelsToMeters(distToSegment(pt, idealLine.p1, idealLine.p2)) * lineWeight;
    }

    function shortMoveSpamCost(consecutiveShortMoves: number, spec: HoldSpec) {
        if (consecutiveShortMoves < 3) return 0;
        const base = Math.pow(WEIGHT_CONFIG.route.shortMoveSpamGrowth, consecutiveShortMoves - 2) * WEIGHT_CONFIG.route.shortMoveSpamBase;
        const hardnessOffset = Math.max(0, spec.handDifficulty - targetHandDifficulty) * WEIGHT_CONFIG.route.shortMoveHardnessOffset;
        return Math.max(0, base - hardnessOffset);
    }

    function getFootPoolFromHands(routeHands: Hold[], h1: Hold, h2: Hold | null) {
        return routeHands.filter(prev => prev.id !== h1.id && (!h2 || prev.id !== h2.id));
    }

    function scoreHandCandidate(candidate: Hold, currentHold: Hold, idealLine: { p1: { x: number, y: number }, p2: { x: number, y: number } }, attempts: number, consecutiveShortMoves: number) {
        const spec = resolveHoldSpec(candidate);
        const dx = candidate.center.x - currentHold.center.x;
        const dy = candidate.center.y - currentHold.center.y;
        const distM = pixelsToMeters(Math.hypot(dx, dy));
        const baseCost = moveDistanceCost(distM);
        if (!Number.isFinite(baseCost)) return Infinity;

        const xBias = isLeftToRight ? Math.max(0, -pixelsToMeters(dx)) : Math.max(0, pixelsToMeters(dx));
        const progressPenalty = xBias * 28;
        const score = baseCost
            + gradeCost(spec)
            + holdDirectionCost(spec, pixelsToMeters(dx), pixelsToMeters(dy))
            + lineCost(candidate.center, idealLine, attempts)
            + progressPenalty
            + shortMoveSpamCost(consecutiveShortMoves, spec)
            + (Math.random() * 1.5);

        return score;
    }

    function scoreFootCandidate(candidate: Hold, h1: Hold, h2: Hold | null, isFinal: boolean, preferRecycledHands: boolean, routeHands: Hold[]) {
        if (candidate.id === h1.id || (h2 && candidate.id === h2.id)) return Infinity;
        const spec = resolveHoldSpec(candidate);
        const highestHandY = h2 ? Math.min(h1.center.y, h2.center.y) : h1.center.y;
        const bodyX = h2 ? (h1.center.x + h2.center.x) / 2 : h1.center.x;
        const bodyY = highestHandY + (height * WEIGHT_CONFIG.route.footBodyYOffsetMeters / pixelsToMeters(1));
        const dxM = pixelsToMeters(candidate.center.x - bodyX);
        const dyM = pixelsToMeters(candidate.center.y - bodyY);
        const belowHands = pixelsToMeters(candidate.center.y - highestHandY);

        if (!isFinal && belowHands < Math.max(WEIGHT_CONFIG.route.footMinDropEasyMeters, WEIGHT_CONFIG.route.footMinDropHardMeters - densityFactor * 0.1)) return Infinity;
        if (!isFinal && belowHands > Math.max(WEIGHT_CONFIG.route.footMaxDropHardMeters, wingspan * WEIGHT_CONFIG.route.footMaxDropMultiplier)) return Infinity;
        if (isFinal && belowHands < Math.max(WEIGHT_CONFIG.route.footFinalMinDropMeters, WEIGHT_CONFIG.route.footFinalTargetMeters - densityFactor * WEIGHT_CONFIG.route.footFinalDropDensityMeters)) return Infinity;

        const distanceCost = Math.abs(dxM) * (isFinal ? WEIGHT_CONFIG.route.footDistanceWeightXFinal : WEIGHT_CONFIG.route.footDistanceWeightX) + Math.abs(dyM) * (isFinal ? WEIGHT_CONFIG.route.footDistanceWeightYFinal : WEIGHT_CONFIG.route.footDistanceWeightY);
        const targetFootRating = targetGradeNum <= 2 ? WEIGHT_CONFIG.route.finishFootQualityEasyTarget : targetGradeNum <= 5 ? WEIGHT_CONFIG.route.finishFootQualityMidTarget : WEIGHT_CONFIG.route.finishFootQualityHardTarget;
        const footQualityCost = Math.abs(spec.footRating - targetFootRating) * WEIGHT_CONFIG.route.finishFootQualityWeight;
        const recycledBonus = preferRecycledHands && routeHands.some(prev => prev.id === candidate.id) ? -WEIGHT_CONFIG.route.finishRecycleBonus : 0;
        const sizeBonus = spec.boxSize >= 85 ? -WEIGHT_CONFIG.route.finishSizeBonusLarge : spec.boxSize >= 65 ? -WEIGHT_CONFIG.route.finishSizeBonusMid : 0;
        const typePenalty = spec.footRating >= 4 && targetGradeNum <= 2 ? WEIGHT_CONFIG.route.finishTypePenaltyEasy : 0;
        return distanceCost + footQualityCost + typePenalty + sizeBonus + recycledBonus + (Math.random() * WEIGHT_CONFIG.route.footSearchJitter);
    }

    function findFeetForHands(h1: Hold, h2: Hold | null, routeHands: Hold[], isFinal: boolean = false) {
        const preferRecycledHands = targetGradeNum >= WEIGHT_CONFIG.route.footRecycleGradeThreshold;
        const recycledPool = preferRecycledHands ? getFootPoolFromHands(routeHands, h1, h2) : [];
        const rankedRecycled = recycledPool
            .map(candidate => ({ candidate, score: scoreFootCandidate(candidate, h1, h2, isFinal, true, routeHands) }))
            .filter(entry => Number.isFinite(entry.score))
            .sort((a, b) => a.score - b.score);

        if (rankedRecycled.length > 0) {
            return rankedRecycled[0].candidate;
        }

        const pool = candidates.filter(h => h.id !== h1.id && (!h2 || h.id !== h2.id));
        const ranked = pool
            .map(candidate => ({ candidate, score: scoreFootCandidate(candidate, h1, h2, isFinal, preferRecycledHands, routeHands) }))
            .filter(entry => Number.isFinite(entry.score))
            .sort((a, b) => a.score - b.score);
        return ranked.length > 0 ? ranked[0].candidate : null;
    }

    function findStableFinishFeet(finalHand: Hold, routeHands: Hold[]) {
        const scored = candidates
            .filter(h => h.id !== finalHand.id)
            .map(candidate => ({ candidate, score: scoreFootCandidate(candidate, finalHand, null, true, targetGradeNum >= 3, routeHands) }))
            .filter(entry => Number.isFinite(entry.score))
            .sort((a, b) => a.score - b.score);

        if (scored.length === 0) return [] as Hold[];

        const chosen: Hold[] = [scored[0].candidate];
        const first = scored[0].candidate;
        const firstSpec = resolveHoldSpec(first);
        const bodyX = finalHand.center.x;

        const second = scored.find(entry => {
            if (entry.candidate.id === first.id) return false;
            if (routeHands.some(prev => prev.id === entry.candidate.id && prev.id !== finalHand.id)) return true;
            const spread = Math.abs(pixelsToMeters(entry.candidate.center.x - bodyX));
            const firstSpread = Math.abs(pixelsToMeters(first.center.x - bodyX));
            const oppositeSide = (entry.candidate.center.x - bodyX) * (first.center.x - bodyX) <= 0;
            return oppositeSide || spread > firstSpread * WEIGHT_CONFIG.route.finishOppositeSideThreshold || firstSpec.footRating <= 2;
        });

        if (second && second.candidate.id !== first.id) {
            chosen.push(second.candidate);
        }

        return chosen;
    }

    function pickStartCandidate() {
        const poolSize = Math.min(heightCandidates.length, Math.max(WEIGHT_CONFIG.route.startPoolSizeMin, Math.round(WEIGHT_CONFIG.route.startPoolBase + densityFactor * WEIGHT_CONFIG.route.startPoolDensityMultiplier)));
        const pool = heightCandidates.slice(0, poolSize);
        // Bias toward edge candidates, but keep enough randomness that repeated generations vary.
        const bias = Math.pow(Math.random(), WEIGHT_CONFIG.route.startBiasExponent);
        const jitter = Math.min(pool.length - 1, Math.floor(bias * pool.length));
        const routeJitter = routeCount % Math.max(1, pool.length);
        return pool[(jitter + routeJitter) % pool.length];
    }

    // Distance from point to line segment
    function distToSegment(p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}) {
        const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 == 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
    }

    // --- GENERATION LOOP WITH RETRIES ---
    let attempts = 0;
    let finalRouteResult: any = null;
    const maxAttempts = targetGradeNum <= 1 ? 60 : (density >= 80 ? 40 : 30);

    while (attempts < maxAttempts) {
        attempts++;
        const start1 = pickStartCandidate();
        
        let generatedHolds: Record<string, number> = {};
        let generatedOrder: string[] = [];
        let routeHandHolds = [start1];
        let holdsUsed: Hold[] = [start1];
        let handToFootArray: Hold[] = [start1];
        
        generatedHolds[start1.id] = 1; // 1 = Start
        generatedOrder.push(start1.id);

        const startFoot = findFeetForHands(start1, null, routeHandHolds);
        if (!startFoot) continue;
        generatedHolds[startFoot.id] = 3;
        generatedOrder.push(startFoot.id);
        holdsUsed.push(startFoot);

        let currentHold = start1;
        let totalDistM = 0;
        let safety = 0;
        let consecutiveShortMoves = 0;

        const yLimitTop = maxY - ((WEIGHT_CONFIG.route.yLimitTopBaseMeters + densityFactor * WEIGHT_CONFIG.route.yLimitTopDensityMeters) / pixelsToMeters(1));
        const yLimitBot = maxY - (Math.max(WEIGHT_CONFIG.route.yLimitBottomBaseMeters, WEIGHT_CONFIG.route.yLimitBottomBufferMeters - densityFactor * WEIGHT_CONFIG.route.yLimitBottomDensityMeters) / pixelsToMeters(1));

        const idealEndXPx = start1.center.x + (isLeftToRight ? 1 : -1) * (targetLen / pixelsToMeters(1));
        const idealEndYPx = start1.center.y - (0.5 / pixelsToMeters(1)); // Average climb up 0.5m
        const idealLine = { p1: start1.center, p2: { x: idealEndXPx, y: idealEndYPx } };

        // Generate handholds until we hit the threshold
        while (totalDistM < (targetLen * 1.05) && safety < 50) {
            safety++;
            const neighbors = candidates.filter(h => {
                if (generatedHolds[h.id]) return false;
                const dx = h.center.x - currentHold.center.x, dy = h.center.y - currentHold.center.y;
                const distM = pixelsToMeters(Math.hypot(dx, dy));
                const minStep = Math.max(WEIGHT_CONFIG.route.minStepBaseMeters, WEIGHT_CONFIG.route.minStepBaseMeters + WEIGHT_CONFIG.route.minStepDensityMeters * (1 - densityFactor));
                const maxStep = wingspan * WEIGHT_CONFIG.route.maxStepWingspanMultiplier;
                if (distM < minStep || distM > maxStep) return false;
                if (h.center.y < yLimitTop || h.center.y > yLimitBot) return false;
                const dxM = pixelsToMeters(dx);
                const minForward = Math.max(WEIGHT_CONFIG.route.minForwardBaseMeters, WEIGHT_CONFIG.route.minForwardBaseMeters + WEIGHT_CONFIG.route.minForwardDensityMeters * (1 - densityFactor));
                if (isLeftToRight && dxM < minForward) return false; // More lenient forward progress
                if (!isLeftToRight && dxM > -minForward) return false;
                return true;
            });

            if (neighbors.length === 0) break;

            neighbors.sort((a, b) => {
                const sA = scoreHandCandidate(a, currentHold, idealLine, attempts, consecutiveShortMoves);
                const sB = scoreHandCandidate(b, currentHold, idealLine, attempts, consecutiveShortMoves);
                return (sA + Math.random() * WEIGHT_CONFIG.route.handSearchJitter) - (sB + Math.random() * WEIGHT_CONFIG.route.handSearchJitter);
            });

            let nextH: Hold | null = null;
            let nextFoot: Hold | null = null;
            for (const candidate of neighbors.slice(0, Math.min(16, 8 + Math.round(densityFactor * 8)))) {
                const foot = findFeetForHands(currentHold, candidate, routeHandHolds);
                if (foot) {
                    nextH = candidate;
                    nextFoot = foot;
                    break;
                }
            }

            if (!nextH || !nextFoot) break;

            const moveDistM = pixelsToMeters(Math.hypot(nextH.center.x - currentHold.center.x, nextH.center.y - currentHold.center.y));
            consecutiveShortMoves = moveDistM < wingspan * WEIGHT_CONFIG.route.shortMoveTriggerRatio ? consecutiveShortMoves + 1 : 0;

            if (!generatedHolds[nextFoot.id]) {
                generatedHolds[nextFoot.id] = 3;
                generatedOrder.push(nextFoot.id);
                holdsUsed.push(nextFoot);
            }

            generatedHolds[nextH.id] = 2; // 2 = Hand
            generatedOrder.push(nextH.id);
            routeHandHolds.push(nextH);
            handToFootArray.push(nextH);
            holdsUsed.push(nextH);
            totalDistM += pixelsToMeters(Math.hypot(nextH.center.x - currentHold.center.x, nextH.center.y - currentHold.center.y));
            currentHold = nextH;

            if (totalDistM >= targetLen * 0.95 && totalDistM <= targetLen * 1.05) break; 
        }

        // Final check on length and height
        if (totalDistM >= targetLen * 0.95 && totalDistM <= targetLen * 1.05) {
            let finalIdx = routeHandHolds.length - 1;
            while (finalIdx > 1 && routeHandHolds[finalIdx].center.y >= start1.center.y) {
                const tempDist = totalDistM - pixelsToMeters(Math.hypot(routeHandHolds[finalIdx].center.x - routeHandHolds[finalIdx-1].center.x, routeHandHolds[finalIdx].center.y - routeHandHolds[finalIdx-1].center.y));
                if (tempDist < targetLen * 0.95) break; 
                finalIdx--;
                totalDistM = tempDist;
            }

            const finalHand = routeHandHolds[finalIdx];
            if (finalHand.center.y < start1.center.y) {
                let newOrder: string[] = [], newHolds: Record<string, number> = {};
                for (let id of generatedOrder) {
                    newOrder.push(id); newHolds[id] = generatedHolds[id];
                    if (id === finalHand.id) break;
                }
                newHolds[finalHand.id] = 4; // Top
                const endFeet = findStableFinishFeet(finalHand, routeHandHolds);
                if (endFeet.length > 0) {
                    for (const endFoot of endFeet) {
                        if (!newHolds[endFoot.id]) {
                            newHolds[endFoot.id] = 3;
                            newOrder.push(endFoot.id);
                            holdsUsed.push(endFoot);
                        }
                    }
                }
                
                finalRouteResult = { 
                    name: `AI TRAVERSE ${(routeCount + 1).toString().padStart(4, '0')}`,
                    grade: targetGradeStr, holds: newHolds, order: newOrder,
                    idealLine: { p1: start1.center, p2: finalHand.center },
                    totalDist: totalDistM
                };
                break;
            }
        }
    }

    if (!finalRouteResult) {
        alert("Could not generate a route meeting length and height requirements. Try changing parameters.");
        return;
    }

    setActiveRoute(finalRouteResult);
    render();

    // Log data
    const logData = {
        timestamp: new Date().toISOString(),
        inputs: { height, wingspan, targetLen, targetGradeStr },
        outputs: {
            estimatedRouteDistanceMeters: finalRouteResult.totalDist,
            holds: finalRouteResult.order.map((id:string, index:number) => {
                const h = holds.find(x => x.id === id)!;
                const type = finalRouteResult.holds[id];
                let distToNextM = null;
                if (index < finalRouteResult.order.length - 1) {
                    const nextH = holds.find(x => x.id === finalRouteResult.order[index+1])!;
                    distToNextM = pixelsToMeters(Math.hypot(h.center.x - nextH.center.x, h.center.y - nextH.center.y));
                }
                return { id: h.id, type, cell: h.cell, cat: h.cat, num: h.num, center: h.center, distToNextMeters: distToNextM };
            })
        }
    };

    fetch('/save_auto_log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ai_generation', data: logData })
    }).catch(err => console.error('Failed to save auto log:', err));
}

