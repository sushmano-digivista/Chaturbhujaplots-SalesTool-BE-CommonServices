package com.anjana.common.controller;

import com.anjana.common.model.MediaAsset;
import com.anjana.common.model.MediaAsset.MediaCategory;
import com.anjana.common.service.MediaService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MediaController.class)
@DisplayName("MediaController Integration Tests")
class MediaControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @MockBean  private MediaService mediaService;

    private MediaAsset sampleAsset;

    @BeforeEach
    void setUp() {
        sampleAsset = MediaAsset.builder()
            .id("asset-1")
            .originalFilename("photo.jpg")
            .storedFilename("uuid-1234.jpg")
            .fileUrl("http://localhost:8081/media/files/uuid-1234.jpg")
            .fileType("IMAGE")
            .mimeType("image/jpeg")
            .fileSizeBytes(102400L)
            .category(MediaCategory.GALLERY)
            .altText("Buddha Garden")
            .active(true)
            .build();
    }

    // ── POST /api/v1/media/upload ─────────────────────────────────────────────

    @Test
    @DisplayName("POST /upload: valid image → 201 Created with asset body")
    void uploadSingle_validImage_returns201() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "photo.jpg", "image/jpeg", "bytes".getBytes());
        when(mediaService.upload(any(), eq(MediaCategory.GALLERY), anyString(), anyString()))
            .thenReturn(sampleAsset);

        mockMvc.perform(multipart("/api/v1/media/upload")
                .file(file)
                .param("category", "GALLERY")
                .param("altText", "Buddha Garden")
                .param("tags", "garden"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value("asset-1"))
            .andExpect(jsonPath("$.fileType").value("IMAGE"))
            .andExpect(jsonPath("$.category").value("GALLERY"));
    }

    @Test
    @DisplayName("POST /upload: default category GALLERY when not provided")
    void uploadSingle_defaultCategory_isGallery() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "photo.jpg", "image/jpeg", "bytes".getBytes());
        when(mediaService.upload(any(), eq(MediaCategory.GALLERY), any(), any()))
            .thenReturn(sampleAsset);

        mockMvc.perform(multipart("/api/v1/media/upload").file(file))
            .andExpect(status().isCreated());

        verify(mediaService).upload(any(), eq(MediaCategory.GALLERY), any(), any());
    }

    // ── POST /api/v1/media/upload/bulk ────────────────────────────────────────

    @Test
    @DisplayName("POST /upload/bulk: multiple files → 201 Created with list")
    void uploadBulk_multipleFiles_returns201WithList() throws Exception {
        MockMultipartFile f1 = new MockMultipartFile("files","a.jpg","image/jpeg","b1".getBytes());
        MockMultipartFile f2 = new MockMultipartFile("files","b.jpg","image/jpeg","b2".getBytes());
        when(mediaService.uploadBulk(anyList(), any())).thenReturn(List.of(sampleAsset, sampleAsset));

        mockMvc.perform(multipart("/api/v1/media/upload/bulk")
                .file(f1).file(f2)
                .param("category", "GALLERY"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.length()").value(2));
    }

    // ── GET /api/v1/media/files/{filename} ────────────────────────────────────

    @Test
    @DisplayName("GET /files/{filename}: existing file → 200 with content-type")
    void serveFile_existingFile_returnsOk() throws Exception {
        ByteArrayResource resource = new ByteArrayResource("fake-jpeg".getBytes()) {
            @Override public String getFilename() { return "uuid-1234.jpg"; }
        };
        when(mediaService.loadAsResource("uuid-1234.jpg")).thenReturn(resource);

        mockMvc.perform(get("/api/v1/media/files/uuid-1234.jpg"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("max-age=31536000")));
    }

    // ── GET /api/v1/media ──────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /: returns list of all active assets")
    void getAll_returnsActiveAssets() throws Exception {
        when(mediaService.getAll()).thenReturn(List.of(sampleAsset));

        mockMvc.perform(get("/api/v1/media"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value("asset-1"));
    }

    // ── GET /api/v1/media/category/{category} ──────────────────────────────────

    @Test
    @DisplayName("GET /category/GALLERY: returns gallery assets")
    void getByCategory_gallery_returnsFiltered() throws Exception {
        when(mediaService.getByCategory(MediaCategory.GALLERY)).thenReturn(List.of(sampleAsset));

        mockMvc.perform(get("/api/v1/media/category/GALLERY"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].category").value("GALLERY"));
    }

    // ── PATCH /api/v1/media/{id} ───────────────────────────────────────────────

    @Test
    @DisplayName("PATCH /{id}: update altText → returns updated asset")
    void update_altText_returnsUpdatedAsset() throws Exception {
        sampleAsset.setAltText("New Caption");
        when(mediaService.update(eq("asset-1"), eq("New Caption"), isNull(), isNull()))
            .thenReturn(sampleAsset);

        mockMvc.perform(patch("/api/v1/media/asset-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("altText", "New Caption"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.altText").value("New Caption"));
    }

    // ── DELETE /api/v1/media/{id} ─────────────────────────────────────────────

    @Test
    @DisplayName("DELETE /{id}: existing asset → 204 No Content")
    void delete_existingAsset_returns204() throws Exception {
        doNothing().when(mediaService).delete("asset-1");

        mockMvc.perform(delete("/api/v1/media/asset-1"))
            .andExpect(status().isNoContent());

        verify(mediaService).delete("asset-1");
    }

    @Test
    @DisplayName("DELETE /{id}: service throws → 500 propagated")
    void delete_serviceThrows_returnsError() throws Exception {
        doThrow(new RuntimeException("Asset not found: bad-id")).when(mediaService).delete("bad-id");

        mockMvc.perform(delete("/api/v1/media/bad-id"))
            .andExpect(status().is5xxServerError());
    }
}
