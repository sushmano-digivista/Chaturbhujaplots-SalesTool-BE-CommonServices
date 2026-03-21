package com.anjana.common.model;

import lombok.*;
import org.springframework.data.annotation.*;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
@Document(collection = "media_assets")
public class MediaAsset {

    @Id private String id;

    private String originalFilename;   // "buddha-garden.jpg"
    private String storedFilename;     // UUID-based unique name
    private String fileUrl;            // public URL served by this service
    private String fileType;           // "IMAGE" | "VIDEO"
    private String mimeType;           // "image/jpeg", "video/mp4"
    private Long   fileSizeBytes;

    private MediaCategory category;    // GALLERY, HERO, AMENITY, DOCUMENT
    private String         tags;       // comma-separated tags for search
    private String         altText;    // accessibility / caption
    private boolean        active;     // soft-delete flag

    @CreatedDate  private LocalDateTime uploadedAt;
    @LastModifiedDate private LocalDateTime updatedAt;

    public enum MediaCategory {
        GALLERY, HERO_BACKGROUND, AMENITY, DOCUMENT, VIDEO_TOUR, OTHER
    }
}
