package org.yamcs.web.rest;

import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.HttpResponseStatus;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.yamcs.YProcessor;
import org.yamcs.YamcsException;
import org.yamcs.management.ManagementService;
import org.yamcs.protobuf.SchemaYamcsManagement;
import org.yamcs.protobuf.YamcsManagement.ProcessorManagementRequest;
import org.yamcs.protobuf.YamcsManagement.ProcessorRequest;
import org.yamcs.security.AuthenticationToken;

public class ProcessorRequestHandler extends AbstractRestRequestHandler {
    private static final Logger log = LoggerFactory.getLogger(ProcessorRequestHandler.class.getName());
    
    
    public void handleRequest(ChannelHandlerContext ctx, FullHttpRequest req, String yamcsInstance, String remainingUri, AuthenticationToken authToken) throws RestException {
        String[] path = remainingUri.split("/", 2);
        
        if (path.length == 0) {
            handleProcessorManagementRequest(ctx, req, yamcsInstance, authToken);
        } else {
            String yprocName = path[0];
            YProcessor yproc = YProcessor.getInstance(yamcsInstance, yprocName);
            if(yproc==null) {
                log.warn("Sending NOT_FOUND because invalid processor name '{}' has been requested", yprocName);
                sendError(ctx, HttpResponseStatus.NOT_FOUND);
                return;
            }
            remainingUri = remainingUri.substring(path.length > 1 ? path[0].length() + 1 : path[0].length());
            handleProcessorRequest(ctx, req, yproc, remainingUri);
        }
    }
        
    private void handleProcessorRequest(ChannelHandlerContext ctx, FullHttpRequest req, YProcessor yproc, String remainingUri) throws RestException {
        ProcessorRequest yprocReq = readMessage(req, SchemaYamcsManagement.ProcessorRequest.MERGE).build();
        if(req.getMethod()==HttpMethod.POST) {
            switch(yprocReq.getOperation()) {
            case RESUME:
                if(!yproc.isReplay()) {
                    throw new BadRequestException("Cannot resume a non replay processor ");
                } 
                yproc.resume();
                break;
            case PAUSE:
                if(!yproc.isReplay()) {
                    throw new BadRequestException("Cannot pause a non replay processor ");
                }
                yproc.pause();
                break;
            case SEEK:
                if(!yproc.isReplay()) {
                    throw new BadRequestException("Cannot seek a non replay processor ");
                }
                if(!yprocReq.hasSeekTime()) {
                    throw new BadRequestException("No seek time specified");                
                }
                yproc.seek(yprocReq.getSeekTime());
                break;
            default:
                throw new BadRequestException("Invalid operation "+yprocReq.getOperation()+" specified");
            }
        }
    }
    
    private void handleProcessorManagementRequest(ChannelHandlerContext ctx, FullHttpRequest req, String yamcsInstance, AuthenticationToken authToken) throws RestException {
        ProcessorManagementRequest yprocReq = readMessage(req, SchemaYamcsManagement.ProcessorManagementRequest.MERGE).build();
        if(req.getMethod()==HttpMethod.POST) {
            switch(yprocReq.getOperation()) {
            case CONNECT_TO_PROCESSOR:
                ManagementService mservice = ManagementService.getInstance();
                try {
                    mservice.connectToProcessor(yprocReq, authToken);
                } catch (YamcsException e) {
                    throw new BadRequestException(e.getMessage());
                }
                break;
            
            case CREATE_PROCESSOR:
                mservice = ManagementService.getInstance();
                try {
                    mservice.createProcessor(yprocReq, authToken);
                } catch (YamcsException e) {
                    throw new BadRequestException(e.getMessage());
                }
                break;
            
            default:
                throw new BadRequestException("Invalid operation "+yprocReq.getOperation()+" specified");
            }
        }
    }
}
