FROM node:24.18.0-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ src/
COPY tsconfig.json ./
RUN npm run build

FROM rust:1-alpine AS backend
RUN apk add --no-cache musl-dev pkgconfig openssl-dev openssl-libs-static ca-certificates
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release && rm src/main.rs
COPY src/main.rs src/main.rs
RUN touch src/main.rs && cargo build --release

FROM scratch
WORKDIR /app
COPY --from=backend /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=backend /app/target/release/switchbot-webui ./
COPY --from=frontend /app/dist/ dist/
EXPOSE 3000
CMD ["./switchbot-webui"]
