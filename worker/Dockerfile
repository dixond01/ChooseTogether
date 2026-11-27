# The converter Lambda as a container image: AWS's Node 22 Lambda base plus
# static ffmpeg/ffprobe builds (they include libx264, AAC and HEIF support).
FROM mwader/static-ffmpeg:7.1.1 AS ffmpeg

FROM public.ecr.aws/lambda/nodejs:22 AS app
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
CMD ["src/handler.handler"]

# Tests against the same ffmpeg the Lambda uses:
#   docker build --target test -t ct-converter-test . && docker run --rm ct-converter-test
FROM app AS test
COPY test ./test
ENTRYPOINT ["node", "--test"]
CMD ["test/convert.test.mjs"]

# The deployed image (the last stage is the default build).
FROM app
