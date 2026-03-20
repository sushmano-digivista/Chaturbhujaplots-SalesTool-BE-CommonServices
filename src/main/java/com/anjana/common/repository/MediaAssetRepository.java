package com.anjana.common.repository;

import com.anjana.common.model.MediaAsset;
import com.anjana.common.model.MediaAsset.MediaCategory;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface MediaAssetRepository extends MongoRepository<MediaAsset, String> {
    List<MediaAsset> findByCategoryAndActiveTrue(MediaCategory category);
    List<MediaAsset> findByActiveTrue();
    List<MediaAsset> findByFileType(String fileType);
}
