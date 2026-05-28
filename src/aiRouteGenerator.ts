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
    routeCount: number;
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
    const { holds, richMetadata, catMapFull, boundaryPoints, pixelsToMeters, height, wingspan, targetLen, targetGradeNum, targetGradeStr, allowedCats, routeCount, setActiveRoute, render } = ctx;

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
        // Correct Grade filter: V0/V1 should allow grade 1 (Diff 1) holds.
        const effectiveTarget = Math.max(1, targetGradeNum);
        const maxAllowed = effectiveTarget <= 3 ? effectiveTarget : effectiveTarget + 1;
        return grade <= maxAllowed;
    });

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

    // Helper: Find a foot for a single hold (static start/end) or between two holds (movement)
    function findFeetForHands(h1: Hold, h2: Hold | null, isFinal: boolean = false) {
        const climberX = h2 ? (h1.center.x + h2.center.x) / 2 : h1.center.x;
        const climberY = (h2 ? (h1.center.y + h2.center.y) / 2 : h1.center.y) + (height * 0.4 / pixelsToMeters(1));
        const highestHandY = h2 ? Math.min(h1.center.y, h2.center.y) : h1.center.y;
        const maxReachPx = (height + (wingspan * 0.35)) / pixelsToMeters(1);

        const footNeighbors = holds.filter(h => {
            if (h.id === h1.id || (h2 && h.id === h2.id)) return false; 
            const dx = h.center.x - climberX;
            const dy = h.center.y - climberY; 
            const distPx = Math.hypot(dx, dy);
            const distM = pixelsToMeters(distPx);
            
            // For the finish (Top), we allow a slightly more cramped or wide footing to ensure we find ONE.
            if (!isFinal) {
                if (distM < height * 0.35) return false;
            } else {
                if (distM < height * 0.2) return false;
            }

            if ((h.center.y - highestHandY) > maxReachPx) return false;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI; 
            
            // Widen angle for final foot (90 +/- 75 degrees)
            const tolerance = isFinal ? 75 : 60;
            if (angle < (90 - tolerance) || angle > (90 + tolerance)) return false;

            return true;
        });

        if (footNeighbors.length > 0) {
            footNeighbors.sort((a, b) => {
                const diffA = getHoldGrade(a).diffNum, diffB = getHoldGrade(b).diffNum;
                return targetGradeNum < 3 ? diffA - diffB : diffB - diffA;
            });
            return footNeighbors[0];
        }
        return null;
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

    while (attempts < 10) {
        attempts++;
        const start1 = heightCandidates[Math.floor(Math.random() * Math.min(10, heightCandidates.length))];
        
        let generatedHolds: Record<string, number> = {};
        let generatedOrder: string[] = [];
        let routeHandHolds = [start1];
        
        generatedHolds[start1.id] = 1; // 1 = Start
        generatedOrder.push(start1.id);

        const startFoot = findFeetForHands(start1, null);
        if (startFoot) { generatedHolds[startFoot.id] = 3; generatedOrder.push(startFoot.id); }

        let currentHold = start1;
        let totalDistM = 0;
        let safety = 0;

        const yLimitTop = maxY - (4.0 / pixelsToMeters(1));
        const yLimitBot = maxY - (0.3 / pixelsToMeters(1));

        const idealEndXPx = start1.center.x + (isLeftToRight ? 1 : -1) * (targetLen / pixelsToMeters(1));
        const idealEndYPx = start1.center.y - (0.5 / pixelsToMeters(1)); // Average climb up 0.5m
        const idealLine = { p1: start1.center, p2: { x: idealEndXPx, y: idealEndYPx } };

        // Generate handholds until we hit the threshold
        while (totalDistM < (targetLen * 1.05) && safety < 40) {
            safety++;
            const neighbors = candidates.filter(h => {
                if (generatedHolds[h.id]) return false;
                const dx = h.center.x - currentHold.center.x, dy = h.center.y - currentHold.center.y;
                const distM = pixelsToMeters(Math.hypot(dx, dy));
                if (distM < 0.4 || distM > wingspan * 0.9) return false;
                if (h.center.y < yLimitTop || h.center.y > yLimitBot) return false;
                const dxM = pixelsToMeters(dx);
                if (isLeftToRight && dxM < 0.1) return false;
                if (!isLeftToRight && dxM > -0.1) return false;
                if (routeHandHolds.some(prev => pixelsToMeters(Math.hypot(h.center.x - prev.center.x, h.center.y - prev.center.y)) < 0.35)) return false;
                return true;
            });

            if (neighbors.length === 0) break;

            neighbors.sort((a, b) => {
                let sA = Math.abs(getHoldGrade(a).grade - targetGradeNum) * 2, sB = Math.abs(getHoldGrade(b).grade - targetGradeNum) * 2;
                sA += pixelsToMeters(distToSegment(a.center, idealLine.p1, idealLine.p2)) * 6;
                sB += pixelsToMeters(distToSegment(b.center, idealLine.p1, idealLine.p2)) * 6;
                return (sA + Math.random()) - (sB + Math.random());
            });

            const nextH = neighbors[0];
            const nextFoot = findFeetForHands(currentHold, nextH);
            if (nextFoot && !generatedHolds[nextFoot.id]) {
                generatedHolds[nextFoot.id] = 3; 
                generatedOrder.push(nextFoot.id);
            }

            generatedHolds[nextH.id] = 2; // 2 = Hand
            generatedOrder.push(nextH.id);
            routeHandHolds.push(nextH);
            totalDistM += pixelsToMeters(Math.hypot(nextH.center.x - currentHold.center.x, nextH.center.y - currentHold.center.y));
            currentHold = nextH;

            // Strict break if we are in the target zone (+/- 5%)
            if (totalDistM >= targetLen * 0.95 && totalDistM <= targetLen * 1.05) {
                break; 
            }
        }

        // Final check on length and height
        if (totalDistM >= targetLen * 0.95 && totalDistM <= targetLen * 1.05) {
            let finalIdx = routeHandHolds.length - 1;
            // Backtrack slightly to find a higher end hold if necessary, but keep length within bounds
            while (finalIdx > 1 && routeHandHolds[finalIdx].center.y >= start1.center.y) {
                const tempDist = totalDistM - pixelsToMeters(Math.hypot(routeHandHolds[finalIdx].center.x - routeHandHolds[finalIdx-1].center.x, routeHandHolds[finalIdx].center.y - routeHandHolds[finalIdx-1].center.y));
                if (tempDist < targetLen * 0.95) break; // Don't backtrack if it makes route too short
                finalIdx--;
                totalDistM = tempDist;
            }

            const finalHand = routeHandHolds[finalIdx];
            if (finalHand.center.y < start1.center.y) {
                // Rebuild order to clean up
                let newOrder: string[] = [], newHolds: Record<string, number> = {};
                for (let id of generatedOrder) {
                    newOrder.push(id); newHolds[id] = generatedHolds[id];
                    if (id === finalHand.id) break;
                }
                newHolds[finalHand.id] = 4; // Top
                const endFoot = findFeetForHands(finalHand, null, true);
                if (endFoot && !newHolds[endFoot.id]) {
                    newHolds[endFoot.id] = 3;
                    newOrder.splice(newOrder.length - 1, 0, endFoot.id);
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

