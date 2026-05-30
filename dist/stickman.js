export class StickmanSimulator {
    height;
    wingspan;
    pixelsToMeters;
    metersToPixels;
    constructor(height, wingspan, p2m) {
        this.height = height;
        this.wingspan = wingspan;
        this.pixelsToMeters = p2m;
        this.metersToPixels = (m) => m / p2m(1);
    }
    // Generate a default starting pose based on a start hold
    getDefaultPose(startHold) {
        const hPx = this.metersToPixels(this.height);
        const wPx = this.metersToPixels(this.wingspan);
        const torsoLen = hPx * 0.35;
        const shoulderWidth = wPx * 0.2;
        const hipWidth = shoulderWidth * 0.8;
        const center = { x: startHold.x, y: startHold.y + torsoLen * 0.5 };
        const sL = { x: center.x - shoulderWidth * 0.5, y: center.y - torsoLen * 0.4 };
        const sR = { x: center.x + shoulderWidth * 0.5, y: center.y - torsoLen * 0.4 };
        const hL = { x: center.x - hipWidth * 0.5, y: center.y + torsoLen * 0.4 };
        const hR = { x: center.x + hipWidth * 0.5, y: center.y + torsoLen * 0.4 };
        const handDefault = { x: startHold.x, y: startHold.y };
        const footLDefault = { x: center.x - 30, y: center.y + torsoLen + 20 };
        const footRDefault = { x: center.x + 30, y: center.y + torsoLen + 20 };
        // simple default elbow/knee midpoints
        const elbowL = { x: (sL.x + handDefault.x) / 2 - 10, y: (sL.y + handDefault.y) / 2 };
        const elbowR = { x: (sR.x + handDefault.x) / 2 + 10, y: (sR.y + handDefault.y) / 2 };
        const kneeL = { x: (hL.x + footLDefault.x) / 2 - 6, y: (hL.y + footLDefault.y) / 2 };
        const kneeR = { x: (hR.x + footRDefault.x) / 2 + 6, y: (hR.y + footRDefault.y) / 2 };
        return {
            head: { x: center.x, y: center.y - torsoLen * 0.6 },
            shoulderL: sL,
            shoulderR: sR,
            hipL: hL,
            hipR: hR,
            handL: handDefault,
            handR: handDefault,
            footL: footLDefault,
            footR: footRDefault,
            elbowL, elbowR, kneeL, kneeR
        };
    }
    // Simple solver to move body towards a set of contacts
    // This is a "Heuristic Pose Solver" rather than full IK
    solvePose(contacts) {
        const hPx = this.metersToPixels(this.height);
        const wPx = this.metersToPixels(this.wingspan);
        const torsoLen = hPx * 0.35;
        const limbLen = wPx * 0.45; // Approx nominal length of arm/leg
        const upperFrac = 0.55, lowerFrac = 0.45;
        const L1 = limbLen * upperFrac; // upper (upper arm / thigh)
        const L2 = limbLen * lowerFrac; // lower (forearm / shin)
        const maxReach = L1 + L2;
        // 1. Calculate Average Center of Mass (CoM) from contacts
        let sumX = 0, sumY = 0, count = 0;
        Object.values(contacts).forEach(p => { if (p) {
            sumX += p.x;
            sumY += p.y;
            count++;
        } });
        // Initial guess for hips/torso center
        let centerX = sumX / count;
        let centerY = (sumY / count) + (hPx * 0.2); // Offset CoM downwards a bit for climbing
        // 2. Adjust center based on reach limits
        // This is a simplified constraint: pull center towards contacts if they are too far
        Object.entries(contacts).forEach(([limb, p]) => {
            if (!p)
                return;
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
        // Helper: two-segment IK (returns elbow/knee and clamped target)
        function twoSegmentIK(origin, target, l1, l2, side = 1) {
            const dx = target.x - origin.x, dy = target.y - origin.y;
            const D = Math.hypot(dx, dy);
            const dirX = dx / (D || 1), dirY = dy / (D || 1);
            // Clamp target into reachable annulus
            let Dclamped = D;
            if (Dclamped > l1 + l2)
                Dclamped = l1 + l2;
            if (Dclamped < Math.abs(l1 - l2))
                Dclamped = Math.abs(l1 - l2);
            // Point along direction at distance 'a' from origin
            const a = (l1 * l1 - l2 * l2 + Dclamped * Dclamped) / (2 * (Dclamped || 1));
            const px = origin.x + dirX * a;
            const py = origin.y + dirY * a;
            const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
            // perpendicular
            const perpX = -dirY, perpY = dirX;
            const elbow = { x: px + perpX * h * side, y: py + perpY * h * side };
            // compute clamped hand position along direction
            const hand = { x: origin.x + dirX * Dclamped, y: origin.y + dirY * Dclamped };
            return { joint: elbow, hand: hand };
        }
        // Determine clamped joints
        const handTargetL = contacts.handL || { x: sL.x - 20, y: sL.y + 40 };
        const handTargetR = contacts.handR || { x: sR.x + 20, y: sR.y + 40 };
        const footTargetL = contacts.footL || { x: hL.x - 10, y: hL.y + 60 };
        const footTargetR = contacts.footR || { x: hR.x + 10, y: hR.y + 60 };
        const ikL = twoSegmentIK(sL, handTargetL, L1, L2, 1);
        const ikR = twoSegmentIK(sR, handTargetR, L1, L2, -1);
        const ikKneeL = twoSegmentIK(hL, footTargetL, L1, L2, 1);
        const ikKneeR = twoSegmentIK(hR, footTargetR, L1, L2, -1);
        // Prevent feet crossing based on final clamped positions
        const minFootSeparation = 8;
        let footLpos = ikKneeL.hand;
        let footRpos = ikKneeR.hand;
        if (footLpos.x > footRpos.x - minFootSeparation) {
            const mid = (footLpos.x + footRpos.x) / 2;
            footLpos.x = mid - minFootSeparation / 2;
            footRpos.x = mid + minFootSeparation / 2;
        }
        return {
            head: { x: centerX, y: centerY - torsoLen * 0.6 },
            shoulderL: sL,
            shoulderR: sR,
            hipL: hL,
            hipR: hR,
            handL: ikL.hand,
            handR: ikR.hand,
            footL: footLpos,
            footR: footRpos,
            elbowL: ikL.joint,
            elbowR: ikR.joint,
            kneeL: ikKneeL.joint,
            kneeR: ikKneeR.joint
        };
    }
}
