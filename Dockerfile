FROM node:24-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ src/
COPY tsconfig.json ./
RUN npm run build

FROM rust:1-alpine AS backend
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release && rm src/main.rs
COPY src/main.rs src/main.rs
RUN touch src/main.rs && cargo build --release

FROM alpine:latest
RUN apk add --no-cache ca-certificates openssl
WORKDIR /app
COPY --from=backend /app/target/release/switchbot-webui ./
COPY --from=frontend /app/dist/ dist/
EXPOSE 3000
CMD ["./switchbot-webui"]
