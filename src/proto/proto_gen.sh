#!/bin/bash

grpc_tools_node_protoc -I `pwd`/chatbothub \
		       --js_out=import_style=commonjs,binary:`pwd`/chatbothub/ \
		       --grpc_out=`pwd`/chatbothub/ \
		       --plugin=protoc-gen-grpc=`which grpc_tools_node_protoc_plugin` \
		       `pwd`/chatbothub/chatbothub.proto
