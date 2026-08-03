FROM node:24.19.0-alpine AS frontend
ARG GIT_HASH=unknown
ARG BUILD_DATE=
ENV GIT_HASH=$GIT_HASH BUILD_DATE=$BUILD_DATE
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ src/
COPY locales/ locales/
COPY scripts/ scripts/
COPY tsconfig.json ./
RUN npm run build

FROM rust:1-alpine AS backend
ARG GIT_HASH=unknown
ARG BUILD_DATE=
ENV GIT_HASH=$GIT_HASH BUILD_DATE=$BUILD_DATE
# reqwest is built against rustls, so no OpenSSL toolchain is needed here.
RUN apk add --no-cache musl-dev ca-certificates
WORKDIR /app
COPY Cargo.toml Cargo.lock build.rs ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release --locked && rm src/main.rs
COPY package.json ./
COPY src/main.rs src/main.rs
RUN touch src/main.rs && cargo build --release --locked

FROM scratch
WORKDIR /app
COPY --from=backend /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=backend /app/target/release/switchbot-webui ./
COPY --from=frontend /app/dist/ dist/
COPY --from=frontend /app/locales/ locales/
EXPOSE 3000
CMD ["./switchbot-webui"]
