package com.anjana.common.controller;

import com.anjana.common.model.MediaAsset;
import com.anjana.common.model.MediaAsset.MediaCategory;
import com.anjana.common.service.MediaService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/media")
@RequiredArgsConstructor
public class MediaController {

    private final MediaService mediaService;

    // ── UPLOAD (single) ───────────────────────────────────────────────────────
    /**
     * POST /api/v1/media/upload
     * Form fields: file (multipart), category, altText, tags
     */
    @PostMapping("/upload")
    public ResponseEntity<MediaAsset> upload(
            @RequestParam("file")      MultipartFile file,
            @RequestParam(value = "category", defaultValue = "GALLERY") String category,
            @RequestParam(value = "altText",  defaultValue = "")        String altText,
            @RequestParam(value = "tags",     defaultValue = "")        String tags) throws IOException {

        MediaAsset saved = mediaService.upload(
                file, MediaCategory.valueOf(category.toUpperCase()), altText, tags);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    // ── UPLOAD (bulk) ─────────────────────────────────────────────────────────
    /**
     * POST /api/v1/media/upload/bulk
     */
    @PostMapping("/upload/bulk")
    public ResponseEntity<List<MediaAsset>> uploadBulk(
            @RequestParam("files")    List<MultipartFile> files,
            @RequestParam(value = "category", defaultValue = "GALLERY") String category) throws IOException {

        List<MediaAsset> saved = mediaService.uploadBulk(files, MediaCategory.valueOf(category.toUpperCase()));
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    // ── SERVE FILE ────────────────────────────────────────────────────────────
    /**
     * GET /api/v1/media/files/{filename}
     * Serves the actual binary file with correct Content-Type.
     */
    @GetMapping("/files/{filename:.+}")
    public ResponseEntity<Resource> serveFile(@PathVariable String filename) {
        Resource resource = mediaService.loadAsResource(filename);
        String   ct       = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        try {
            String name = resource.getFilename();
            if (name != null) {
                if      (name.matches(".*\\.(jpg|jpeg)$")) ct = "image/jpeg";
                else if (name.endsWith(".png"))             ct = "image/png";
                else if (name.endsWith(".webp"))            ct = "image/webp";
                else if (name.endsWith(".mp4"))             ct = "video/mp4";
                else if (name.endsWith(".mov"))             ct = "video/quicktime";
            }
        } catch (Exception ignored) {}

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(ct))
                .header(HttpHeaders.CACHE_CONTROL, "max-age=31536000, immutable")
                .body(resource);
    }

    // ── LIST ──────────────────────────────────────────────────────────────────
    @GetMapping
    public ResponseEntity<List<MediaAsset>> getAll() {
        return ResponseEntity.ok(mediaService.getAll());
    }

    @GetMapping("/category/{category}")
    public ResponseEntity<List<MediaAsset>> getByCategory(@PathVariable String category) {
        return ResponseEntity.ok(mediaService.getByCategory(MediaCategory.valueOf(category.toUpperCase())));
    }

    @GetMapping("/{id}")
    public ResponseEntity<MediaAsset> getById(@PathVariable String id) {
        return ResponseEntity.ok(mediaService.getById(id));
    }

    // ── UPDATE METADATA ───────────────────────────────────────────────────────
    @PatchMapping("/{id}")
    public ResponseEntity<MediaAsset> update(
            @PathVariable String id,
            @RequestBody Map<String, String> body) {

        String cat = body.get("category");
        MediaCategory category = (cat != null) ? MediaCategory.valueOf(cat.toUpperCase()) : null;
        return ResponseEntity.ok(mediaService.update(id, body.get("altText"), body.get("tags"), category));
    }

    // ── SOFT DELETE ───────────────────────────────────────────────────────────
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        mediaService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
