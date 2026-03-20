package com.anjana.common.service;

import com.anjana.common.model.MediaAsset;
import com.anjana.common.model.MediaAsset.MediaCategory;
import com.anjana.common.repository.MediaAssetRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.*;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class MediaService {

    private final MediaAssetRepository mediaRepo;

    @Value("${app.storage.base-dir}") private String baseDir;
    @Value("${app.storage.base-url}") private String baseUrl;

    private Path storageRoot;

    @PostConstruct
    public void init() {
        storageRoot = Paths.get(baseDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(storageRoot);
            log.info("✓ Storage directory ready: {}", storageRoot);
        } catch (IOException e) {
            throw new RuntimeException("Could not create storage directory", e);
        }
    }

    // ── UPLOAD ────────────────────────────────────────────────────────────────
    public MediaAsset upload(MultipartFile file, MediaCategory category,
                             String altText, String tags) throws IOException {
        validateFile(file);

        String ext           = getExtension(file.getOriginalFilename());
        String storedName    = UUID.randomUUID() + "." + ext;
        Path   targetPath    = storageRoot.resolve(storedName);

        Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);

        String fileType = file.getContentType() != null && file.getContentType().startsWith("video")
                          ? "VIDEO" : "IMAGE";

        MediaAsset asset = MediaAsset.builder()
                .originalFilename(file.getOriginalFilename())
                .storedFilename(storedName)
                .fileUrl(baseUrl + "/" + storedName)
                .fileType(fileType)
                .mimeType(file.getContentType())
                .fileSizeBytes(file.getSize())
                .category(category)
                .altText(altText)
                .tags(tags)
                .active(true)
                .build();

        MediaAsset saved = mediaRepo.save(asset);
        log.info("Uploaded: {} → {} ({})", file.getOriginalFilename(), storedName, fileType);
        return saved;
    }

    // ── BULK UPLOAD ───────────────────────────────────────────────────────────
    public List<MediaAsset> uploadBulk(List<MultipartFile> files,
                                       MediaCategory category) throws IOException {
        List<MediaAsset> results = new ArrayList<>();
        for (MultipartFile f : files) {
            results.add(upload(f, category, f.getOriginalFilename(), ""));
        }
        return results;
    }

    // ── READ ──────────────────────────────────────────────────────────────────
    public List<MediaAsset> getAll()                            { return mediaRepo.findByActiveTrue(); }
    public List<MediaAsset> getByCategory(MediaCategory cat)   { return mediaRepo.findByCategoryAndActiveTrue(cat); }
    public MediaAsset       getById(String id) {
        return mediaRepo.findById(id).orElseThrow(() -> new RuntimeException("Asset not found: " + id));
    }

    public Resource loadAsResource(String filename) {
        try {
            Path   file     = storageRoot.resolve(filename).normalize();
            Resource resource = new UrlResource(file.toUri());
            if (resource.exists() && resource.isReadable()) return resource;
            throw new RuntimeException("File not found: " + filename);
        } catch (MalformedURLException e) {
            throw new RuntimeException("Could not read file: " + filename, e);
        }
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    public MediaAsset update(String id, String altText, String tags, MediaCategory category) {
        MediaAsset a = getById(id);
        if (altText  != null) a.setAltText(altText);
        if (tags     != null) a.setTags(tags);
        if (category != null) a.setCategory(category);
        return mediaRepo.save(a);
    }

    // ── SOFT DELETE ───────────────────────────────────────────────────────────
    public void delete(String id) {
        MediaAsset a = getById(id);
        a.setActive(false);
        mediaRepo.save(a);
        log.info("Soft-deleted asset: {}", id);
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────
    private void validateFile(MultipartFile file) {
        if (file.isEmpty()) throw new IllegalArgumentException("File is empty");
        String ct = file.getContentType();
        if (ct == null || (!ct.startsWith("image/") && !ct.startsWith("video/")))
            throw new IllegalArgumentException("Only image and video files are allowed. Got: " + ct);
        if (file.getSize() > 100L * 1024 * 1024)
            throw new IllegalArgumentException("File size exceeds 100 MB limit");
    }

    private String getExtension(String filename) {
        if (filename == null || !filename.contains(".")) return "bin";
        return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
    }
}
