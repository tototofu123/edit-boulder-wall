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
        // Strict grade filtering: no crazy hard holds on easy routes
        const maxAllowed = targetGradeNum <= 2 ? targetGradeNum : targetGradeNum + 1;
        return grade <= maxAllowed;
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

        // The absolute highest hand being reached for (smallest Y)
        const highestHandY = h2 ? Math.min(h1.center.y, h2.center.y) : h1.center.y;
        const maxReachPx = (height + (wingspan * 0.35)) / pixelsToMeters(1);

        const footNeighbors = holds.filter(h => {
            if (h.id === h1.id || (h2 && h.id === h2.id)) return false; 
            
            const dx = h.center.x - climberX;
            const dy = h.center.y - climberY; // Positive dy is DOWN
            const distPx = Math.hypot(dx, dy);
            const distM = pixelsToMeters(distPx);
            
            // Minimum foot distance to prevent cramping
            if (distM < height * 0.35) return false;

            // Maximum reach: foot cannot be further from the HIGHEST hand than (Height + 35% Wingspan)
            if ((h.center.y - highestHandY) > maxReachPx) return false;

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

    // Generate an ideal smooth line to follow
    const idealEndXPx = start1.center.x + (isLeftToRight ? 1 : -1) * (targetLen / pixelsToMeters(1));
    const idealEndYPx = start1.center.y - (Math.random() * 1.5 / pixelsToMeters(1)); // Traverses usually go slightly up
    const idealLine = { p1: start1.center, p2: { x: idealEndXPx, y: idealEndYPx } };

    // Distance from point to line segment
    function distToSegment(p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}) {
        const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 == 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
    }

    // Aim for +10% to give us room to safely chop back to an optimal end hold
    while (totalDistM < (targetLen * 1.1) && safety < 40) {
        safety++;
        
        const handNeighbors = candidates.filter(h => {
            if (generatedHolds[h.id]) return false;
            
            const dx = h.center.x - currentHold.center.x;
            const dy = h.center.y - currentHold.center.y;
            const distPx = Math.hypot(dx, dy);
            const distM = pixelsToMeters(distPx);
            
            // Enforce minimum distance to prevent clustered, redundant holds
            if (distM < 0.4 || distM > wingspan * 0.9) return false;
            if (h.center.y < yLimitTop || h.center.y > yLimitBot) return false;

            const dxM = pixelsToMeters(dx);
            
            // ENFORCE TRAVERSE: Must make significant horizontal progress
            if (isLeftToRight && dxM < 0.15) return false;
            if (!isLeftToRight && dxM > -0.15) return false;

            // Check if it's too close to ANY previously established handhold
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

            // Penalize deviation from the ideal smooth line
            const distLineA = pixelsToMeters(distToSegment(a.center, idealLine.p1, idealLine.p2));
            const distLineB = pixelsToMeters(distToSegment(b.center, idealLine.p1, idealLine.p2));
            scoreA += distLineA * 5; // Heavy penalty for wandering off the line
            scoreB += distLineB * 5;

            // Encourage moving HIGHER than the start hold later in the route
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
        
        // Find foot for this move
        const nextFoot = findFeetForHands(currentHold, nextHand);
        if (nextFoot && !generatedHolds[nextFoot.id]) {
            generatedHolds[nextFoot.id] = 3; // 3 = Foot
            generatedOrder.push(nextFoot.id);
        }

        generatedHolds[nextHand.id] = 2; // 2 = Hand
        generatedOrder.push(nextHand.id);
        routeHandHolds.push(nextHand);
        
        totalDistM += pixelsToMeters(Math.hypot(nextHand.center.x - currentHold.center.x, nextHand.center.y - currentHold.center.y));
        currentHold = nextHand;
    }

    if (routeHandHolds.length > 1) {
        // Enforce the end hold is higher than start hold. If the last one isn't, walk back.
        let validEndFound = false;
        let endIdx = routeHandHolds.length - 1;
        for (; endIdx > 0; endIdx--) {
            if (routeHandHolds[endIdx].center.y < start1.center.y) {
                validEndFound = true;
                break;
            }
        }
        
        // If we couldn't find a strictly higher hold, just accept the last one to avoid destroying the route
        if (!validEndFound) {
            endIdx = routeHandHolds.length - 1;
        }

        const finalHand = routeHandHolds[endIdx];
        
        // We must remove these extra hands AND their feet from the order array
        // To do this cleanly, we rebuild the generatedOrder array up to finalHand
        let newOrder: string[] = [];
        let newHolds: Record<string, number> = {};
        
        for (let id of generatedOrder) {
            newOrder.push(id);
            newHolds[id] = generatedHolds[id];
            if (id === finalHand.id) {
                break; // Stop including holds once we hit the final hand
            }
        }
        
        generatedOrder = newOrder;
        generatedHolds = newHolds;

        // Ensure the final hand is designated as END
        generatedHolds[finalHand.id] = 4; // 4 = End
        
        // Add one final foot to match the end hold, placed BEFORE the end hold in the list for neatness
        const endFoot = findFeetForHands(finalHand, null);
        if (endFoot && !generatedHolds[endFoot.id]) {
            generatedHolds[endFoot.id] = 3;
            // Insert it right before the END hold
            generatedOrder.splice(generatedOrder.length - 1, 0, endFoot.id);
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

    // Re-calculate the actual total distance for the log based on final holds
    let finalActualDistM = 0;
    const finalHandIds = generatedOrder.filter(id => generatedHolds[id] === 2 || generatedHolds[id] === 1 || generatedHolds[id] === 4);
    for (let i = 0; i < finalHandIds.length - 1; i++) {
        const h1 = holds.find(x => x.id === finalHandIds[i])!;
        const h2 = holds.find(x => x.id === finalHandIds[i+1])!;
        finalActualDistM += pixelsToMeters(Math.hypot(h1.center.x - h2.center.x, h1.center.y - h2.center.y));
    }

    // Build the auto-log
    const logData = {
        timestamp: new Date().toISOString(),
        inputs: {
            height,
            wingspan,
            targetLen,
            targetGradeStr
        },
        outputs: {
            estimatedRouteDistanceMeters: finalActualDistM,
            holds: generatedOrder.map((id, index) => {
                const h = holds.find(x => x.id === id)!;
                const type = generatedHolds[id];
                
                // Calculate distance to next hold in order (if it exists)
                let distToNextPx = null;
                let distToNextM = null;
                if (index < generatedOrder.length - 1) {
                    const nextH = holds.find(x => x.id === generatedOrder[index+1])!;
                    distToNextPx = Math.hypot(h.center.x - nextH.center.x, h.center.y - nextH.center.y);
                    distToNextM = pixelsToMeters(distToNextPx);
                }

                return {
                    id: h.id,
                    type: type,
                    cell: h.cell,
                    cat: h.cat,
                    num: h.num,
                    center: h.center,
                    distToNextMeters: distToNextM
                };
            })
        }
    };

    fetch('/save_auto_log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData)
    }).catch(err => console.error('Failed to save auto log:', err));
}
