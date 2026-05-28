export interface Hold {
    id: string;
    cat: string;
    num: number;
    cell: string;
    center: { x: number, y: number };
}

export interface RouteContext {
    holds: Hold[];
    richMetadata: any;
    catMapFull: any;
    boundaryPoints: { x: number, y: number }[];
    pixelsToMeters: (px: number) => number;
    height: number;
    wingspan: number;
    targetLen: number;
    targetGradeNum: number;
    targetGradeStr: string;
    allowedCats: string[];
    setActiveRoute: (route: any) => void;
    render: () => void;
}

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
    const { holds, richMetadata, catMapFull, boundaryPoints, pixelsToMeters, height, wingspan, targetLen, targetGradeNum, targetGradeStr, allowedCats, setActiveRoute, render } = ctx;

    const gradeMap: Record<number, number> = { 1: 1, 2: 3, 3: 4, 4: 6, 5: 8 };

    function getHoldGrade(h: Hold) {
        const meta = (richMetadata[h.cell] || {})[`${catMapFull[h.cat]}${h.num}`] || {};
        const hDiff = parseInt(meta.difficulty || 1);
        return { diffNum: hDiff, grade: gradeMap[hDiff] || 0 };
    }

    const candidates = holds.filter(h => {
        if (!allowedCats.includes(h.cat)) return false;
        if (!isPointInPoly(h.center, boundaryPoints)) return false;
        const { grade } = getHoldGrade(h);
        return grade <= targetGradeNum + 2; // Allow slightly harder holds for crux
    });

    if (candidates.length < 5) {
        alert("Not enough suitable holds in boundary!");
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
    if (heightCandidates.length === 0) {
        heightCandidates = candidates; // Fallback if no holds in height range
    }

    // Sort by proximity to the starting edge
    heightCandidates.sort((a, b) => isLeftToRight ? a.center.x - b.center.x : b.center.x - a.center.x);

    // Take from the best 10 closest to the edge
    const startCandidates = heightCandidates.slice(0, Math.min(10, heightCandidates.length));
    const start1 = startCandidates[Math.floor(Math.random() * startCandidates.length)];
    
    let generatedHolds: Record<string, number> = {};
    let generatedOrder: string[] = [];
    
    generatedHolds[start1.id] = 1; // 1 = Start
    generatedOrder.push(start1.id);

    // Helper: Find a foot for a single hold (static start/end) or between two holds (movement)
    function findFeetForHands(h1: Hold, h2: Hold | null) {
        const climberX = h2 ? (h1.center.x + h2.center.x) / 2 : h1.center.x;
        const climberY = (h2 ? (h1.center.y + h2.center.y) / 2 : h1.center.y) + (height * 0.4 / pixelsToMeters(1));

        const footNeighbors = holds.filter(h => {
            if (h.id === h1.id || (h2 && h.id === h2.id)) return false; 
            
            const dx = h.center.x - climberX;
            const dy = h.center.y - climberY; // Positive dy is DOWN
            const distPx = Math.hypot(dx, dy);
            const distM = pixelsToMeters(distPx);
            
            // Reachable distance for feet (max ~ 0.7 * height)
            if (distM > height * 0.7) return false;

            // Angle check: down is 90 degrees. +/- 60 degrees is 30 to 150 degrees.
            const angle = Math.atan2(dy, dx) * 180 / Math.PI; 
            if (angle < 30 || angle > 150) return false;

            return true;
        });

        if (footNeighbors.length > 0) {
            footNeighbors.sort((a, b) => {
                const diffA = getHoldGrade(a).diffNum;
                const diffB = getHoldGrade(b).diffNum;
                if (targetGradeNum < 3) {
                    return diffA - diffB; // Prefer easier
                } else {
                    return diffB - diffA; // Prefer harder
                }
            });
            return footNeighbors[0];
        }
        return null;
    }

    // Add initial foot for start hold
    const startFoot = findFeetForHands(start1, null);
    if (startFoot && !generatedHolds[startFoot.id]) {
        generatedHolds[startFoot.id] = 3;
        generatedOrder.push(startFoot.id);
    }

    let currentHold = start1;
    let totalDistM = 0;
    let safety = 0;

    const yLimitTop = maxY - (4.0 / pixelsToMeters(1));
    const yLimitBot = maxY - (0.3 / pixelsToMeters(1));

    let routeHandHolds = [start1];

    while (totalDistM < targetLen && safety < 30) {
        safety++;
        
        const handNeighbors = candidates.filter(h => {
            if (generatedHolds[h.id]) return false;
            
            const dx = h.center.x - currentHold.center.x;
            const dy = h.center.y - currentHold.center.y;
            const distPx = Math.hypot(dx, dy);
            const distM = pixelsToMeters(distPx);
            
            // Enforce minimum distance to prevent clustered, redundant holds (0.4m to wingspan*0.9)
            if (distM < 0.4 || distM > wingspan * 0.9) return false;

            if (h.center.y < yLimitTop || h.center.y > yLimitBot) return false;

            const dxM = pixelsToMeters(dx);
            // Strictly enforce monotonic horizontal progress for hands to prevent zigzags
            if (isLeftToRight && dxM <= 0) return false;
            if (!isLeftToRight && dxM >= 0) return false;

            // Check if it's too close to ANY previously established handhold (prevents zigzag redundancy)
            let tooCloseToPrev = false;
            for (let prev of routeHandHolds) {
                const prevDistM = pixelsToMeters(Math.hypot(h.center.x - prev.center.x, h.center.y - prev.center.y));
                if (prevDistM < 0.35) tooCloseToPrev = true;
            }
            if (tooCloseToPrev) return false;

            return true;
        });

        if (handNeighbors.length === 0) break;

        handNeighbors.sort((a, b) => {
            let scoreA = Math.abs(getHoldGrade(a).grade - targetGradeNum) * 2;
            let scoreB = Math.abs(getHoldGrade(b).grade - targetGradeNum) * 2;

            const dxA = pixelsToMeters(a.center.x - currentHold.center.x);
            const dxB = pixelsToMeters(b.center.x - currentHold.center.x);
            
            scoreA -= isLeftToRight ? dxA : -dxA;
            scoreB -= isLeftToRight ? dxB : -dxB;

            // Encourage moving HIGHER than the start hold, especially later in the route
            const progress = totalDistM / targetLen;
            if (progress > 0.4) {
                const dyA = pixelsToMeters(a.center.y - start1.center.y); // Negative is higher
                const dyB = pixelsToMeters(b.center.y - start1.center.y);
                scoreA += dyA * 2; 
                scoreB += dyB * 2;
            }

            scoreA += Math.random() * 1.0;
            scoreB += Math.random() * 1.0;

            return scoreA - scoreB;
        });

        const nextHand = handNeighbors[0];
        
        generatedHolds[nextHand.id] = 2; // 2 = Hand
        generatedOrder.push(nextHand.id);
        routeHandHolds.push(nextHand);
        
        totalDistM += pixelsToMeters(Math.hypot(nextHand.center.x - currentHold.center.x, nextHand.center.y - currentHold.center.y));

        const nextFoot = findFeetForHands(currentHold, nextHand);
        if (nextFoot && !generatedHolds[nextFoot.id]) {
            generatedHolds[nextFoot.id] = 3; // 3 = Foot
            generatedOrder.push(nextFoot.id);
        }

        currentHold = nextHand;
    }

    if (routeHandHolds.length > 1) {
        // Enforce the end hold is higher than start hold. If the last one isn't, walk back.
        let endIdx = routeHandHolds.length - 1;
        while (endIdx > 1 && routeHandHolds[endIdx].center.y >= start1.center.y) {
            // Remove the hold and any immediately following feet
            const removedHandId = routeHandHolds[endIdx].id;
            delete generatedHolds[removedHandId];
            generatedOrder = generatedOrder.filter(id => id !== removedHandId);
            endIdx--;
        }

        const finalHand = routeHandHolds[endIdx];
        generatedHolds[finalHand.id] = 4; // 4 = End
        
        // Final End Foot (for matching the end hold)
        const endFoot = findFeetForHands(finalHand, null);
        if (endFoot && !generatedHolds[endFoot.id]) {
            generatedHolds[endFoot.id] = 3;
            generatedOrder.push(endFoot.id);
        }
    }

    const route = { 
        name: `AI TRAVERSE ${isLeftToRight ? 'L->R' : 'R->L'}`, 
        grade: targetGradeStr, 
        holds: generatedHolds, 
        order: generatedOrder 
    };

    setActiveRoute(route);
    render();
}
