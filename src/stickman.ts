export interface Point { x: number; y: number; }

export interface Skeleton {
    head: Point;
    shoulderL: Point;
    shoulderR: Point;
    hipL: Point;
    hipR: Point;
    handL: Point;
    handR: Point;
    footL: Point;
    footR: Point;
}

export class StickmanSimulator {
    height: number;
    wingspan: number;
    pixelsToMeters: (px: number) => number;
    metersToPixels: (m: number) => number;

    constructor(height: number, wingspan: number, p2m: (px: number) => number) {
        this.height = height;
        this.wingspan = wingspan;
        this.pixelsToMeters = p2m;
        this.metersToPixels = (m: number) => m / p2m(1);
    }

    // Generate a default starting pose based on a start hold
    getDefaultPose(startHold: Point): Skeleton {
        const hPx = this.metersToPixels(this.height);
        const wPx = this.metersToPixels(this.wingspan);

        const torsoLen = hPx * 0.35;
        const shoulderWidth = wPx * 0.2;
        const hipWidth = shoulderWidth * 0.8;

        const center = { x: startHold.x, y: startHold.y + torsoLen * 0.5 };
        
        return {
            head: { x: center.x, y: center.y - torsoLen * 0.6 },
            shoulderL: { x: center.x - shoulderWidth * 0.5, y: center.y - torsoLen * 0.4 },
            shoulderR: { x: center.x + shoulderWidth * 0.5, y: center.y - torsoLen * 0.4 },
            hipL: { x: center.x - hipWidth * 0.5, y: center.y + torsoLen * 0.4 },
            hipR: { x: center.x + hipWidth * 0.5, y: center.y + torsoLen * 0.4 },
            handL: { x: startHold.x, y: startHold.y },
            handR: { x: startHold.x, y: startHold.y },
            footL: { x: center.x - 30, y: center.y + torsoLen + 20 },
            footR: { x: center.x + 30, y: center.y + torsoLen + 20 }
        };
    }

    // Simple solver to move body towards a set of contacts
    // This is a "Heuristic Pose Solver" rather than full IK
    solvePose(contacts: { handL?: Point, handR?: Point, footL?: Point, footR?: Point }): Skeleton {
        const hPx = this.metersToPixels(this.height);
        const wPx = this.metersToPixels(this.wingspan);
        const torsoLen = hPx * 0.35;
        const limbLen = wPx * 0.45; // Approx length of arm/leg

        // 1. Calculate Average Center of Mass (CoM) from contacts
        let sumX = 0, sumY = 0, count = 0;
        Object.values(contacts).forEach(p => { if (p) { sumX += p.x; sumY += p.y; count++; } });
        
        // Initial guess for hips/torso center
        let centerX = sumX / count;
        let centerY = (sumY / count) + (hPx * 0.2); // Offset CoM downwards a bit for climbing

        // 2. Adjust center based on reach limits
        // This is a simplified constraint: pull center towards contacts if they are too far
        Object.entries(contacts).forEach(([limb, p]) => {
            if (!p) return;
            const d = Math.hypot(p.x - centerX, p.y - centerY);
            if (d > limbLen * 1.2) {
                const ratio = (d - limbLen) / d;
                centerX += (p.x - centerX) * ratio * 0.5;
                centerY += (p.y - centerY) * ratio * 0.5;
            }
        });

        const shoulderWidth = wPx * 0.2;
        const hipWidth = shoulderWidth * 0.8;

        const sL = { x: centerX - shoulderWidth * 0.5, y: centerY - torsoLen * 0.4 };
        const sR = { x: centerX + shoulderWidth * 0.5, y: centerY - torsoLen * 0.4 };
        const hL = { x: centerX - hipWidth * 0.5, y: centerY + torsoLen * 0.4 };
        const hR = { x: centerX + hipWidth * 0.5, y: centerY + torsoLen * 0.4 };

        return {
            head: { x: centerX, y: centerY - torsoLen * 0.6 },
            shoulderL: sL,
            shoulderR: sR,
            hipL: hL,
            hipR: hR,
            handL: contacts.handL || { x: sL.x - 20, y: sL.y + 40 },
            handR: contacts.handR || { x: sR.x + 20, y: sR.y + 40 },
            footL: contacts.footL || { x: hL.x - 10, y: hL.y + 60 },
            footR: contacts.footR || { x: hR.x + 10, y: hR.y + 60 }
        };
    }
}
