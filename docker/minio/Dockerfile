FROM golang:1.24-alpine AS builder

ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z

RUN apk add --no-cache bash git
WORKDIR /src
RUN git clone --depth 1 --branch "${MINIO_RELEASE}" https://github.com/minio/minio.git .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -tags kqueue \
    -trimpath \
    --ldflags "$(go run buildscripts/gen-ldflags.go)" \
    -o /out/minio .

FROM alpine:3.22

RUN apk add --no-cache ca-certificates curl \
    && addgroup -S minio \
    && adduser -S -G minio -h /data minio \
    && mkdir -p /data \
    && chown minio:minio /data

COPY --from=builder /out/minio /usr/local/bin/minio

USER minio
EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
