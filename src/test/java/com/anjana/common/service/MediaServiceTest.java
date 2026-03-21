package com.anjana.common.service;

import com.anjana.common.model.MediaAsset;
import com.anjana.common.model.MediaAsset.MediaCategory;
import com.anjana.common.repository.MediaAssetRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("MediaService Unit Tests")
class MediaServiceTest {

    @Mock  private MediaAssetRepository mediaRepo;
    @InjectMocks private MediaService mediaService;

    private Path tempDir;

    @BeforeEach
    void setUp() throws IOException {
        tempDir = Files.createTempDirectory("media-test-");
        ReflectionTestUtils.setField(mediaService, "baseDir",  tempDir.toString());
        ReflectionTestUtils.setField(mediaService, "baseUrl",  "http://localhost:8081/media/files");
        mediaService.init();
    }

    @AfterEach
    void tearDown() throws IOException {
        // cleanup temp files
        Files.walk(tempDir)
             .sorted(Comparator.reverseOrder())
             .forEach(p -> p.toFile().delete());
    }

    // ── upload() ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("upload: valid JPEG image → persists asset with correct metadata")
    void upload_validJpeg_persistsAsset() throws IOException {
        MockMultipartFile file = new MockMultipartFile(
            "file", "buddha.jpg", "image/jpeg", "fake-jpeg-bytes".getBytes());

        MediaAsset saved = MediaAsset.builder()
            .id("asset-1").originalFilename("buddha.jpg")
            .fileType("IMAGE").category(MediaCategory.GALLERY).active(true).build();
        when(mediaRepo.save(any(MediaAsset.class))).thenReturn(saved);

        MediaAsset result = mediaService.upload(file, MediaCategory.GALLERY, "Buddha Garden", "garden,statue");

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo("asset-1");
        verify(mediaRepo).save(argThat(a ->
            a.getOriginalFilename().equals("buddha.jpg") &&
            a.getFileType().equals("IMAGE") &&
            a.getCategory() == MediaCategory.GALLERY &&
            a.getAltText().equals("Buddha Garden") &&
            a.isActive()
        ));
    }

    @Test
    @DisplayName("upload: MP4 video file → fileType set to VIDEO")
    void upload_mp4Video_fileTypeIsVideo() throws IOException {
        MockMultipartFile file = new MockMultipartFile(
            "file", "tour.mp4", "video/mp4", "fake-video".getBytes());

        when(mediaRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        MediaAsset result = mediaService.upload(file, MediaCategory.VIDEO_TOUR, "Site tour", "");

        verify(mediaRepo).save(argThat(a -> a.getFileType().equals("VIDEO")));
    }

    @Test
    @DisplayName("upload: empty file → throws IllegalArgumentException")
    void upload_emptyFile_throwsException() {
        MockMultipartFile emptyFile = new MockMultipartFile(
            "file", "empty.jpg", "image/jpeg", new byte[0]);

        assertThatThrownBy(() -> mediaService.upload(emptyFile, MediaCategory.GALLERY, "", ""))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("empty");
    }

    @ParameterizedTest
    @ValueSource(strings = {"text/plain", "application/pdf", "application/json"})
    @DisplayName("upload: non-image/video MIME type → throws IllegalArgumentException")
    void upload_invalidMimeType_throwsException(String mimeType) {
        MockMultipartFile file = new MockMultipartFile(
            "file", "document.pdf", mimeType, "some bytes".getBytes());

        assertThatThrownBy(() -> mediaService.upload(file, MediaCategory.DOCUMENT, "", ""))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Only image and video");
    }

    @Test
    @DisplayName("upload: file URL contains stored filename")
    void upload_fileUrl_containsStoredFilename() throws IOException {
        MockMultipartFile file = new MockMultipartFile(
            "file", "photo.png", "image/png", "png-bytes".getBytes());
        when(mediaRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        mediaService.upload(file, MediaCategory.GALLERY, "", "");

        verify(mediaRepo).save(argThat(a ->
            a.getFileUrl() != null &&
            a.getFileUrl().startsWith("http://localhost:8081/media/files/")
        ));
    }

    // ── uploadBulk() ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("uploadBulk: 3 valid images → saves all 3 assets")
    void uploadBulk_threeImages_savesAll() throws IOException {
        List<MockMultipartFile> files = List.of(
            new MockMultipartFile("f1","img1.jpg","image/jpeg","b1".getBytes()),
            new MockMultipartFile("f2","img2.jpg","image/jpeg","b2".getBytes()),
            new MockMultipartFile("f3","img3.jpg","image/jpeg","b3".getBytes())
        );
        when(mediaRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        List<MediaAsset> results = mediaService.uploadBulk(
            new ArrayList<>(files), MediaCategory.GALLERY);

        assertThat(results).hasSize(3);
        verify(mediaRepo, times(3)).save(any(MediaAsset.class));
    }

    // ── getAll() ──────────────────────────────────────────────────────────────

    @Test
    @DisplayName("getAll: returns only active assets")
    void getAll_returnsOnlyActive() {
        List<MediaAsset> active = List.of(
            MediaAsset.builder().id("a1").active(true).build(),
            MediaAsset.builder().id("a2").active(true).build()
        );
        when(mediaRepo.findByActiveTrue()).thenReturn(active);

        List<MediaAsset> result = mediaService.getAll();

        assertThat(result).hasSize(2);
        assertThat(result).allMatch(MediaAsset::isActive);
    }

    // ── getByCategory() ───────────────────────────────────────────────────────

    @Test
    @DisplayName("getByCategory: GALLERY category → returns only gallery assets")
    void getByCategory_gallery_returnsGalleryAssets() {
        List<MediaAsset> gallery = List.of(
            MediaAsset.builder().id("g1").category(MediaCategory.GALLERY).active(true).build()
        );
        when(mediaRepo.findByCategoryAndActiveTrue(MediaCategory.GALLERY)).thenReturn(gallery);

        List<MediaAsset> result = mediaService.getByCategory(MediaCategory.GALLERY);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getCategory()).isEqualTo(MediaCategory.GALLERY);
    }

    // ── getById() ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("getById: existing id → returns asset")
    void getById_existingId_returnsAsset() {
        MediaAsset asset = MediaAsset.builder().id("asset-1").build();
        when(mediaRepo.findById("asset-1")).thenReturn(Optional.of(asset));

        MediaAsset result = mediaService.getById("asset-1");

        assertThat(result.getId()).isEqualTo("asset-1");
    }

    @Test
    @DisplayName("getById: unknown id → throws RuntimeException")
    void getById_unknownId_throws() {
        when(mediaRepo.findById("bad-id")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> mediaService.getById("bad-id"))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("Asset not found");
    }

    // ── update() ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("update: new altText → persists updated altText")
    void update_newAltText_persisted() {
        MediaAsset existing = MediaAsset.builder().id("a1").altText("old").build();
        when(mediaRepo.findById("a1")).thenReturn(Optional.of(existing));
        when(mediaRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        MediaAsset result = mediaService.update("a1", "new caption", null, null);

        assertThat(result.getAltText()).isEqualTo("new caption");
    }

    @Test
    @DisplayName("update: null fields → original values preserved")
    void update_nullFields_preservesOriginal() {
        MediaAsset existing = MediaAsset.builder().id("a1").altText("keep").tags("tag1").build();
        when(mediaRepo.findById("a1")).thenReturn(Optional.of(existing));
        when(mediaRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        MediaAsset result = mediaService.update("a1", null, null, null);

        assertThat(result.getAltText()).isEqualTo("keep");
        assertThat(result.getTags()).isEqualTo("tag1");
    }

    // ── delete() ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("delete: existing asset → active flag set to false (soft delete)")
    void delete_existingAsset_softDeleted() {
        MediaAsset asset = MediaAsset.builder().id("a1").active(true).build();
        when(mediaRepo.findById("a1")).thenReturn(Optional.of(asset));
        when(mediaRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        mediaService.delete("a1");

        verify(mediaRepo).save(argThat(a -> !a.isActive()));
    }

    @Test
    @DisplayName("delete: unknown id → throws RuntimeException")
    void delete_unknownId_throws() {
        when(mediaRepo.findById("bad")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> mediaService.delete("bad"))
            .isInstanceOf(RuntimeException.class);
    }
}
