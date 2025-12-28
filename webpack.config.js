const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? false : 'inline-source-map',
    
    entry: {
      'chatgpt-content': './src/content/chatgpt-content.ts',
      'claude-content': './src/content/claude-content.ts',
      'gemini-content': './src/content/gemini-content.ts',
      'copilot-content': './src/content/copilot-content.ts',
      styles: './src/styles.css'
    },
    
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: true, // Remove all console.logs
              drop_debugger: true,
              pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn']
            },
            mangle: true, // Obfuscate variable names
            format: {
              comments: false // Remove all comments
            }
          },
          extractComments: false
        })
      ]
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
};