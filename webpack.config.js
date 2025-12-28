const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: {
    'chatgpt-content': './src/content/chatgpt-content.ts',
    'claude-content': './src/content/claude-content.ts',
    'gemini-content': './src/content/gemini-content.ts',
    'copilot-content': './src/content/copilot-content.ts',  // ADD THIS
    styles: './src/styles.css'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      }
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: './src/styles.css', to: 'styles.css' },
        { from: 'icons', to: 'icons' }
      ],
    }),
  ],
};