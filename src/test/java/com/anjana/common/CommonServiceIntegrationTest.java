package com.anjana.common;

import com.anjana.common.model.MediaAsset;
import com.anjana.common.model.MediaAsset.MediaCategory;
import com.anjana.common.repository.MediaAssetRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.*;
import java.util.Comparator;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
    "app.storage.base-dir=${java.io.tmpdir}/anjana-test-media",
    "app.storage.base-url=http://localhost/media/files",
    "app.cors.allowed-origins=http://localhost:3000"
})
@DisplayName("CommonService Integration Tests")
class CommonServiceIntegrationTest {

    @Autowired private MockMvc               mockMvc;
    @Autowired private MediaAssetRepository  mediaRepo;
    @Autowired private ObjectMapper          objectMapper;

    private static Path tempDir;

    @BeforeEach
    void setUp() throws Exception {
        mediaRepo.deleteAll();
        tempDir = Paths.get(System.getProperty("java.io.tmpdir"), "anjana-test-media");
        Files.createDirectories(tempDir);
    }

    @AfterEach
    void tearDown() throws Exception {
        mediaRepo.deleteAll();
        if (Files.exists(tempDir)) {
            Files.walk(tempDir)
                 .sorted(Comparator.reverseOrder())
                 .forEach(p -> p.toFile().delete());
        }
    }

    // ── Full upload lifecycle ─────────────────────────────────────────────────

    @Test
    @DisplayName("Upload → Serve → List → Delete full lifecycle")
    void fullLifecycle_uploadServeListDelete() throws Exception {
        // 1. Upload
        MockMultipartFile file = new MockMultipartFile(
            "file","buddha.jpg","image/jpeg","fake-jpeg-bytes".getBytes());

        String responseJson = mockMvc.perform(
                multipart("/api/v1/media/upload")
                    .file(file)
                    .param("category","GALLERY")
                    .param("altText","Buddha Garden")
                    .param("tags","garden,statue"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").isNotEmpty())
            .andExpect(jsonPath("$.fileType").value("IMAGE"))
            .andExpect(jsonPath("$.active").value(true))
            .andReturn().getResponse().getContentAsString();

        MediaAsset uploaded = objectMapper.readValue(responseJson, MediaAsset.class);
        String assetId = uploaded.getId();

        // 2. Verify persisted in MongoDB
        assertThat(mediaRepo.findById(assetId)).isPresent();

        // 3. List – should appear
        mockMvc.perform(get("/api/v1/media"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].altText").value("Buddha Garden"));

        // 4. List by category
        mockMvc.perform(get("/api/v1/media/category/GALLERY"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1));

        // 5. Soft delete
        mockMvc.perform(delete("/api/v1/media/" + assetId))
            .andExpect(status().isNoContent());

        // 6. Should not appear in list after delete
        mockMvc.perform(get("/api/v1/media"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));

        // 7. But still exists in DB with active=false
        MediaAsset deleted = mediaRepo.findById(assetId).orElseThrow();
        assertThat(deleted.isActive()).isFalse();
    }

    @Test
    @DisplayName("Bulk upload → creates multiple assets")
    void bulkUpload_createsMultipleAssets() throws Exception {
        MockMultipartFile f1 = new MockMultipartFile("files","a.jpg","image/jpeg","b1".getBytes());
        MockMultipartFile f2 = new MockMultipartFile("files","b.jpg","image/jpeg","b2".getBytes());
        MockMultipartFile f3 = new MockMultipartFile("files","c.jpg","image/jpeg","b3".getBytes());

        mockMvc.perform(multipart("/api/v1/media/upload/bulk")
                .file(f1).file(f2).file(f3)
                .param("category","GALLERY"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.length()").value(3));

        assertThat(mediaRepo.findByCategoryAndActiveTrue(MediaCategory.GALLERY)).hasSize(3);
    }

    @Test
    @DisplayName("Update metadata → altText and category updated")
    void updateMetadata_updatesAltTextAndCategory() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file","test.jpg","image/jpeg","bytes".getBytes());
        String resp = mockMvc.perform(multipart("/api/v1/media/upload")
                .file(file).param("category","GALLERY"))
            .andReturn().getResponse().getContentAsString();
        String id = objectMapper.readValue(resp, MediaAsset.class).getId();

        mockMvc.perform(patch("/api/v1/media/" + id)
                .contentType("application/json")
                .content("{\"altText\":\"Updated Caption\",\"category\":\"AMENITY\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.altText").value("Updated Caption"))
            .andExpect(jsonPath("$.category").value("AMENITY"));
    }

    @Test
    @DisplayName("Upload invalid MIME type → 500 (service throws)")
    void upload_invalidMimeType_throws() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file","doc.pdf","application/pdf","bytes".getBytes());

        mockMvc.perform(multipart("/api/v1/media/upload").file(file))
            .andExpect(status().is5xxServerError());
    }

    @Test
    @DisplayName("Context loads — application starts correctly")
    void contextLoads() {
        assertThat(mediaRepo).isNotNull();
    }
}
