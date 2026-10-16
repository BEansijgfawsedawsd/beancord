import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: "https://s3.filebase.com",
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY,
    secretAccessKey: process.env.FILEBASE_SECRET_KEY,
  },
  forcePathStyle: true,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fileName, fileData, contentType } = req.body;
    const bucketName = process.env.FILEBASE_BUCKET;

    if (!fileData || !fileName) {
      return res.status(400).json({ error: "Missing file data or file name" });
    }

    const buffer = Buffer.from(fileData.split(",")[1], "base64");

    const uploadParams = {
      Bucket: bucketName,
      Key: fileName,
      Body: buffer,
      ACL: "public-read",
      ContentType: contentType || "application/octet-stream",
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    const fileUrl = `https://${bucketName}.s3.filebase.com/${fileName}`;
    return res.status(200).json({ success: true, url: fileUrl });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: error.message });
  }
}
