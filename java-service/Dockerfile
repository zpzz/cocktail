# 国内镜像加速：基础镜像 DaoCloud + Maven/apt 阿里云
FROM docker.m.daocloud.io/library/maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build

COPY maven-settings.xml /root/.m2/settings.xml
COPY pom.xml .
COPY src ./src
RUN mvn -q -B -DskipTests package \
    && cp target/java-service-0.1.0-SNAPSHOT.jar /build/app.jar

FROM docker.m.daocloud.io/library/eclipse-temurin:17-jre-jammy
WORKDIR /app

RUN sed -i 's|archive.ubuntu.com|mirrors.aliyun.com|g; s|security.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null \
    || sed -i 's|archive.ubuntu.com|mirrors.aliyun.com|g; s|security.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list.d/*.list 2>/dev/null \
    || true \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /build/app.jar /app/app.jar

RUN mkdir -p /app/data/avatars
ENV AVATAR_DIR=/app/data/avatars

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=8 \
  CMD curl -fsS http://127.0.0.1:8080/actuator/health >/dev/null || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
