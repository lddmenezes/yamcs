package org.yamcs.parameterarchive;

import java.util.Arrays;
import java.util.List;

import org.rocksdb.RocksDBException;
import org.yamcs.YamcsServer;
import org.yamcs.parameterarchive.ParameterArchiveV2.Partition;
import org.yamcs.parameterarchive.ParameterIdDb.ParameterId;
import org.yamcs.protobuf.Yamcs.StringMessage;
import org.yamcs.security.Privilege;
import org.yamcs.web.BadRequestException;
import org.yamcs.web.ForbiddenException;
import org.yamcs.web.HttpException;
import org.yamcs.web.InternalServerErrorException;
import org.yamcs.web.rest.RestHandler;
import org.yamcs.web.rest.RestRequest;
import org.yamcs.web.rest.Route;

/**
 * Provides some maintenance operations on the parameter archive
 * 
 * @author nm
 *
 */
public class ParameterArchiveMaintenanceRestHandler extends RestHandler {

    /**
     * Request to (re)build the parameterArchive between start and stop
     * 
     */
    @Route(path = "/api/archive/:instance/parameterArchive/rebuild", method = "POST")
    public void reprocess(RestRequest req) throws HttpException {
        String instance = verifyInstance(req, req.getRouteParam("instance"));
        checkPrivileges(req);

        if (!req.hasQueryParameter("start")) {
            throw new BadRequestException("no start specified");
        }
        if (!req.hasQueryParameter("stop")) {
            throw new BadRequestException("no stop specified");
        }
        long start = req.getQueryParameterAsDate("start");
        long stop = req.getQueryParameterAsDate("stop");

        ParameterArchiveV2 parchive = getParameterArchive(instance);
        try {
            parchive.reprocess(start, stop);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException(e.getMessage());
        }

        completeOK(req);
    }

    @Route(path = "/api/archive/:instance/parameterArchive/deletePartitions", method = "POST")
    public void deletePartition(RestRequest req) throws HttpException {
        String instance = verifyInstance(req, req.getRouteParam("instance"));
        checkPrivileges(req);

        if (!req.hasQueryParameter("start")) {
            throw new BadRequestException("no start specified");
        }
        if (!req.hasQueryParameter("stop")) {
            throw new BadRequestException("no stop specified");
        }
        long start = req.getQueryParameterAsDate("start");
        long stop = req.getQueryParameterAsDate("stop");

        ParameterArchiveV2 parchive = getParameterArchive(instance);
        try {
            List<Partition> removed = parchive.deletePartitions(start, stop);
            StringBuilder sb = new StringBuilder();
            sb.append("removed the following partitions: ");
            boolean first = true;
            for (Partition p : removed) {
                if (first) {
                    first = false;
                } else {
                    sb.append(", ");
                }
                sb.append(p.toString());
            }
            StringMessage sm = StringMessage.newBuilder().setMessage(sb.toString()).build();

            completeOK(req, sm);

        } catch (RocksDBException e) {
            throw new InternalServerErrorException(e.getMessage());
        }

    }

    @Route(path = "/api/archive/:instance/parameterArchive/info/parameter/:name*", method = "GET")
    public void archiveInfo(RestRequest req) throws HttpException {
        String instance = verifyInstance(req, req.getRouteParam("instance"));
        checkPrivileges(req);

        String fqn = req.getRouteParam("name");
        ParameterArchiveV2 parchive = getParameterArchive(instance);
        ParameterIdDb pdb = parchive.getParameterIdDb();
        ParameterId[] pids = pdb.get(fqn);
        StringMessage sm = StringMessage.newBuilder().setMessage(Arrays.toString(pids)).build();
        completeOK(req, sm);
    }

    private static ParameterArchiveV2 getParameterArchive(String instance) throws BadRequestException {
        ParameterArchive parameterArchive = YamcsServer.getService(instance, ParameterArchive.class);

        if (parameterArchive == null) {
            throw new BadRequestException("ParameterArchive not configured for this instance");
        }
        if (!(parameterArchive.getParchive() instanceof ParameterArchiveV2)) {
            throw new BadRequestException("instance uses old unsupported ParameterArchive");
        }
        return (ParameterArchiveV2) parameterArchive.getParchive();
    }

    private void checkPrivileges(RestRequest req) throws HttpException {
        if (!Privilege.getInstance().hasPrivilege1(req.getAuthToken(), Privilege.SystemPrivilege.MayControlArchiving)) {
            throw new ForbiddenException("No privilege for this operation");
        }
    }

}
