## 使用帮助
### 1.先安装node.js，需要node14以上版本，node安装包下载地址：https://nodejs.org/zh-cn/download/  
### 2.配置镜像源
```
npm config set registry https://registry.npmmirror.com
```
### 3.下载插件
```
npm install -g zs-gitlab-tool
```
### 4.运行插件
```
zsgit
```
### 5.首次运行时会要求输入gitlab地址和token(令牌)，请按照提示输入，输入完成后会生成配置文件，下次运行时直接使用zsgit即可
#### 5.1令牌生成地址：https://git.gdzskj.ltd/-/user_settings/personal_access_tokens
#### 5.2需要特别注意，令牌权限请选择：api，read_user
![](https://images.gdzskj.tech/uvzmdu526B.jpg)
![](https://images.gdzskj.tech/uvzmdwg1Pe.jpg)
