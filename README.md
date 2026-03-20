# Common Service — Anjana Paradise Platform

Microservice responsible for **media upload, storage and serving** (images and videos) for the Anjana Paradise real estate platform.

## Tech Stack
- Java 17 · Spring Boot 3.2
- MongoDB (media asset metadata)
- Local file storage (Docker volume in production)

## Port
`8081`

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/media/upload` | None | Upload single image/video |
| `POST` | `/api/v1/media/upload/bulk` | None | Upload multiple files |
| `GET`  | `/api/v1/media/files/{filename}` | None | Serve file (cached 1yr) |
| `GET`  | `/api/v1/media` | None | List all active assets |
| `GET`  | `/api/v1/media/category/{cat}` | None | Filter by category |
| `GET`  | `/api/v1/media/{id}` | None | Get single asset |
| `PATCH`| `/api/v1/media/{id}` | None | Update metadata |
| `DELETE`| `/api/v1/media/{id}` | None | Soft delete |

### Media Categories
`GALLERY` · `HERO_BACKGROUND` · `AMENITY` · `VIDEO_TOUR` · `DOCUMENT` · `OTHER`

## Running Locally

```bash
# Prerequisites: Java 17, Maven 3.9+, MongoDB running on localhost:27017

mvn spring-boot:run
```

## Running Tests

```bash
mvn test                    # all tests
mvn test -Dtest=MediaServiceTest           # unit only
mvn test -Dtest=CommonServiceIntegrationTest  # integration only
mvn test jacoco:report      # with coverage report → target/site/jacoco/
```

## Docker

```bash
docker build -t anjana-common-service .
docker run -p 8081:8081 \
  -e SPRING_DATA_MONGODB_URI=mongodb://host.docker.internal:27017/anjana_common \
  -v $(pwd)/uploads:/app/uploads \
  anjana-common-service
```

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `spring.data.mongodb.uri` | `mongodb://localhost:27017/anjana_common` | MongoDB connection |
| `app.storage.base-dir` | `./uploads` | Local file storage directory |
| `app.storage.base-url` | `http://localhost:8081/media/files` | Public base URL for files |
| `app.cors.allowed-origins` | `http://localhost:3000,...` | Allowed CORS origins |

## Project Structure

```
src/
├── main/java/com/anjana/common/
│   ├── CommonServiceApplication.java
│   ├── config/CorsConfig.java
│   ├── controller/MediaController.java
│   ├── model/MediaAsset.java
│   ├── repository/MediaAssetRepository.java
│   └── service/MediaService.java
└── test/java/com/anjana/common/
    ├── CommonServiceIntegrationTest.java
    ├── controller/MediaControllerTest.java
    ├── repository/MediaAssetRepositoryTest.java
    └── service/MediaServiceTest.java
```

## Part of Anjana Paradise Platform

| Service | Port | Repo |
|---------|------|------|
| **common-service** | 8081 | ← this repo |
| dashboard-service | 8082 | Chaturbhujaplots-SalesTool-BE-DashboardServices |
| plot-service | 8083 | Chaturbhujaplots-SalesTool-BE-PlotServices |
| customer-frontend | 3000 | Chaturbhujaplots-SalesTool-FE-CustomerTool |
