// ============================================================================
// CLOUDFLARE WORKER: Temporary Image Host for Crusade Score Calculator
// Stores PNG images in KV with auto-expiration (24h) and serves them via short URLs.
// Used by the Discord Activity to provide browser-openable image links.
//
// KV Namespace binding required: IMAGE_STORE
//   - Create in Cloudflare dashboard: Workers & Pages → KV → Create namespace
//   - Bind in wrangler.toml or dashboard as IMAGE_STORE
//
// Deploy: wrangler deploy
// ============================================================================

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// 24 hours in seconds
const IMAGE_TTL = 86400;

// Max image size: 4MB (generous for 2x-scale PNGs)
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

/**
 * Generate a short random ID (8 chars, URL-safe)
 */
function generateId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => chars[b % chars.length]).join("");
}

/**
 * Handle POST /upload — store a PNG blob, return a short URL
 */
async function handleUpload(request, env, url) {
    const contentType = request.headers.get("Content-Type") || "";

    let imageData;

    if (contentType.includes("application/octet-stream") || contentType.includes("image/png")) {
        // Raw binary PNG upload
        imageData = await request.arrayBuffer();
    } else if (contentType.includes("multipart/form-data")) {
        // FormData upload
        const formData = await request.formData();
        const file = formData.get("image");
        if (!file || !(file instanceof File)) {
            return jsonResponse(400, { error: "Missing 'image' field in form data" });
        }
        imageData = await file.arrayBuffer();
    } else {
        return jsonResponse(400, { error: "Unsupported Content-Type. Send image/png or multipart/form-data." });
    }

    // Validate size
    if (imageData.byteLength > MAX_IMAGE_SIZE) {
        return jsonResponse(413, { error: `Image too large. Max ${MAX_IMAGE_SIZE / 1024 / 1024}MB.` });
    }

    if (imageData.byteLength === 0) {
        return jsonResponse(400, { error: "Empty image data" });
    }

    // Generate short ID and store in KV with TTL
    const id = generateId();
    await env.IMAGE_STORE.put(id, imageData, {
        expirationTtl: IMAGE_TTL,
        metadata: { contentType: "image/png", size: imageData.byteLength }
    });

    // Build the public URL for this image (with .png extension for Discord embeds)
    const imageUrl = `${url.origin}/i/${id}.png`;

    return jsonResponse(200, { url: imageUrl, id: id, expiresIn: IMAGE_TTL });
}

/**
 * Handle GET /i/:id — serve a stored PNG image
 */
async function handleServeImage(id, env) {
    const { value, metadata } = await env.IMAGE_STORE.getWithMetadata(id, { type: "arrayBuffer" });

    if (!value) {
        return new Response("Image not found or expired.", {
            status: 404,
            headers: { "Content-Type": "text/plain", ...CORS_HEADERS }
        });
    }

    return new Response(value, {
        status: 200,
        headers: {
            "Content-Type": (metadata && metadata.contentType) || "image/png",
            "Cache-Control": "public, max-age=3600",
            "Content-Disposition": "inline",
            ...CORS_HEADERS
        }
    });
}

/**
 * JSON response helper
 */
function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status: status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        // POST /upload — store image, return short URL
        if (request.method === "POST" && url.pathname === "/upload") {
            try {
                return await handleUpload(request, env, url);
            } catch (err) {
                return jsonResponse(500, { error: "Upload failed: " + err.message });
            }
        }

        // GET /i/:id or /i/:id.png — serve stored image
        if (request.method === "GET" && url.pathname.startsWith("/i/")) {
            let id = url.pathname.slice(3); // strip "/i/"
            // Strip .png extension if present (allows Discord-friendly URLs like /i/abc123.png)
            if (id.endsWith('.png')) id = id.slice(0, -4);
            if (!id || id.length < 6) {
                return jsonResponse(400, { error: "Invalid image ID" });
            }
            try {
                return await handleServeImage(id, env);
            } catch (err) {
                return jsonResponse(500, { error: "Failed to retrieve image" });
            }
        }

        // GET / — health check
        if (request.method === "GET" && url.pathname === "/") {
            return jsonResponse(200, {
                service: "Crusade Score Calculator — Image Host",
                endpoints: {
                    upload: "POST /upload (image/png body or multipart/form-data)",
                    serve: "GET /i/:id"
                }
            });
        }

        return jsonResponse(404, { error: "Not found" });
    }
};
