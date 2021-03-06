package org.yamcs.simulator.launchland;

import java.nio.ByteBuffer;

import org.yamcs.simulator.CCSDSPacket;

public class AckData {

//    private float timestamp; //TODO not used?
//    private int commandReceived;

    public AckData(CCSDSPacket packet) {
        ByteBuffer buffer = packet.getUserDataBuffer();
//        commandReceived = (int) buffer.get(0);
    }

    public AckData() {
    }

    public void fillPacket(CCSDSPacket packet, int bufferOffset, int commandReceived) {
        ByteBuffer buffer = packet.getUserDataBuffer();
        buffer.position(bufferOffset);
        buffer.put((byte) commandReceived);
    }

    @Override
    public String toString() {
        return String.format("[AckData]");
    }
}
