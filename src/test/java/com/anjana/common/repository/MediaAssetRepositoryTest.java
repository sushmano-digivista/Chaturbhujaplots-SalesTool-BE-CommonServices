package com.anjana.common.repository;

import com.anjana.common.model.MediaAsset;
import com.anjana.common.model.MediaAsset.MediaCategory;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataMongoTest
@DisplayName("MediaAssetRepository Tests")
class MediaAssetRepositoryTest {

    @Autowired private MediaAssetRepository repo;

    @BeforeEach void setUp()    { repo.deleteAll(); }
    @AfterEach  void tearDown() { repo.deleteAll(); }

    private MediaAsset asset(String id, MediaCategory cat, boolean active) {
        return MediaAsset.builder()
            .originalFilename(id + ".jpg").storedFilename(id + "-stored.jpg")
            .fileUrl("http://test/" + id).fileType("IMAGE").mimeType("image/jpeg")
            .fileSizeBytes(1024L).category(cat).active(active).build();
    }

    @Test
    @DisplayName("findByActiveTrue: returns only active assets")
    void findByActiveTrue_returnsOnlyActive() {
        repo.save(asset("active1", MediaCategory.GALLERY, true));
        repo.save(asset("active2", MediaCategory.GALLERY, true));
        repo.save(asset("deleted", MediaCategory.GALLERY, false));

        List<MediaAsset> results = repo.findByActiveTrue();

        assertThat(results).hasSize(2);
        assertThat(results).allMatch(MediaAsset::isActive);
    }

    @Test
    @DisplayName("findByCategoryAndActiveTrue: filters by category AND active")
    void findByCategoryAndActiveTrue_filtersCategoryAndActive() {
        repo.save(asset("g1", MediaCategory.GALLERY,         true));
        repo.save(asset("g2", MediaCategory.GALLERY,         true));
        repo.save(asset("h1", MediaCategory.HERO_BACKGROUND, true));
        repo.save(asset("gd", MediaCategory.GALLERY,         false)); // inactive gallery

        List<MediaAsset> results = repo.findByCategoryAndActiveTrue(MediaCategory.GALLERY);

        assertThat(results).hasSize(2);
        assertThat(results).allMatch(a -> a.getCategory() == MediaCategory.GALLERY && a.isActive());
    }

    @Test
    @DisplayName("findByFileType: returns assets matching file type")
    void findByFileType_returnsMatchingType() {
        MediaAsset img   = asset("img", MediaCategory.GALLERY, true);
        MediaAsset video = asset("vid", MediaCategory.VIDEO_TOUR, true);
        video.setFileType("VIDEO");
        repo.save(img);
        repo.save(video);

        List<MediaAsset> images = repo.findByFileType("IMAGE");
        List<MediaAsset> videos = repo.findByFileType("VIDEO");

        assertThat(images).hasSize(1);
        assertThat(videos).hasSize(1);
        assertThat(images.get(0).getFileType()).isEqualTo("IMAGE");
    }

    @Test
    @DisplayName("save and findById: persists and retrieves correctly")
    void saveAndFindById() {
        MediaAsset saved = repo.save(asset("test", MediaCategory.GALLERY, true));
        assertThat(saved.getId()).isNotBlank();

        MediaAsset found = repo.findById(saved.getId()).orElseThrow();
        assertThat(found.getOriginalFilename()).isEqualTo("test.jpg");
        assertThat(found.getCategory()).isEqualTo(MediaCategory.GALLERY);
    }

    @Test
    @DisplayName("findByCategoryAndActiveTrue: empty collection → empty list")
    void findByCategoryAndActiveTrue_emptyCollection_emptyList() {
        List<MediaAsset> results = repo.findByCategoryAndActiveTrue(MediaCategory.AMENITY);
        assertThat(results).isEmpty();
    }
}
