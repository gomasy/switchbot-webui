declare module "*.css";

// Parcel がビルド時に置換する環境変数
declare const process: { env: { NODE_ENV?: string } };
