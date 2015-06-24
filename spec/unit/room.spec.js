"use strict";
var sdk = require("../..");
var Room = sdk.Room;
var MatrixEvent = sdk.MatrixEvent;
var utils = require("../test-utils");

describe("Room", function() {
    var roomId = "!foo:bar";
    var userA = "@alice:bar";
    var userB = "@bertha:bar";
    var userC = "@clarissa:bar";
    var userD = "@dorothy:bar";
    var room;

    beforeEach(function() {
        utils.beforeEach(this);
        room = new Room(roomId);
        // mock RoomStates
        room.oldState = utils.mock(sdk.RoomState, "oldState");
        room.currentState = utils.mock(sdk.RoomState, "currentState");
    });

    describe("getMember", function() {
        beforeEach(function() {
            // clobber members property with test data
            room.currentState.members = {
                "@alice:bar": {
                    userId: userA,
                    roomId: roomId
                }
            };
        });

        it("should return null if the member isn't in current state", function() {
            expect(room.getMember("@bar:foo")).toEqual(null);
        });

        it("should return the member from current state", function() {
            expect(room.getMember(userA)).not.toEqual(null);
        });
    });

    describe("addEventsToTimeline", function() {
        var events = [
            new MatrixEvent(utils.mkMessage(roomId, userA, "changing room name")),
            new MatrixEvent(utils.mkEvent("m.room.name", roomId, userA, {
                name: "New Room Name"
            }))
        ];

        it("should be able to add events to the end", function() {
            room.addEventsToTimeline(events);
            expect(room.timeline.length).toEqual(2);
            expect(room.timeline[0]).toEqual(events[0]);
            expect(room.timeline[1]).toEqual(events[1]);
        });

        it("should be able to add events to the start", function() {
            room.addEventsToTimeline(events, true);
            expect(room.timeline.length).toEqual(2);
            expect(room.timeline[0]).toEqual(events[1]);
            expect(room.timeline[1]).toEqual(events[0]);
        });

        it("should emit 'Room.timeline' events when added to the end",
        function() {
            var callCount = 0;
            room.on("Room.timeline", function(event, emitRoom, toStart) {
                callCount += 1;
                expect(room.timeline.length).toEqual(callCount);
                expect(event).toEqual(events[callCount - 1]);
                expect(emitRoom).toEqual(room);
                expect(toStart).toBeFalsy();
            });
            room.addEventsToTimeline(events);
            expect(callCount).toEqual(2);
        });

        it("should emit 'Room.timeline' events when added to the start",
        function() {
            var callCount = 0;
            room.on("Room.timeline", function(event, emitRoom, toStart) {
                callCount += 1;
                expect(room.timeline.length).toEqual(callCount);
                expect(event).toEqual(events[callCount - 1]);
                expect(emitRoom).toEqual(room);
                expect(toStart).toBe(true);
            });
            room.addEventsToTimeline(events, true);
            expect(callCount).toEqual(2);
        });

        it("should set event.sender for new and old events", function() {
            var sentinel = {
                userId: userA,
                membership: "join",
                name: "Alice"
            };
            var oldSentinel = {
                userId: userA,
                membership: "join",
                name: "Old Alice"
            };
            room.currentState.getSentinelMember.andCallFake(function(uid) {
                if (uid === userA) {
                    return sentinel;
                }
                return null;
            });
            room.oldState.getSentinelMember.andCallFake(function(uid) {
                if (uid === userA) {
                    return oldSentinel;
                }
                return null;
            });

            var newEv = new MatrixEvent(utils.mkEvent("m.room.name", roomId, userA, {
                name: "New Room Name"
            }));
            var oldEv = new MatrixEvent(utils.mkEvent("m.room.name", roomId, userA, {
                name: "Old Room Name"
            }));
            room.addEventsToTimeline([newEv]);
            expect(newEv.sender).toEqual(sentinel);
            room.addEventsToTimeline([oldEv], true);
            expect(oldEv.sender).toEqual(oldSentinel);
        });

        it("should set event.target for new and old m.room.member events",
        function() {
            var sentinel = {
                userId: userA,
                membership: "join",
                name: "Alice"
            };
            var oldSentinel = {
                userId: userA,
                membership: "join",
                name: "Old Alice"
            };
            room.currentState.getSentinelMember.andCallFake(function(uid) {
                if (uid === userA) {
                    return sentinel;
                }
                return null;
            });
            room.oldState.getSentinelMember.andCallFake(function(uid) {
                if (uid === userA) {
                    return oldSentinel;
                }
                return null;
            });

            var newEv = new MatrixEvent(
                utils.mkMembership(roomId, "invite", userB, userA)
            );
            var oldEv = new MatrixEvent(
                utils.mkMembership(roomId, "ban", userB, userA)
            );
            room.addEventsToTimeline([newEv]);
            expect(newEv.target).toEqual(sentinel);
            room.addEventsToTimeline([oldEv], true);
            expect(oldEv.target).toEqual(oldSentinel);
        });
    });

    describe("getJoinedMembers", function() {

        it("should return members whose membership is 'join'", function() {
            room.currentState.getMembers.andCallFake(function() {
                return [
                    { userId: "@alice:bar", membership: "join" },
                    { userId: "@bob:bar", membership: "invite" },
                    { userId: "@cleo:bar", membership: "leave" }
                ];
            });
            var res = room.getJoinedMembers();
            expect(res.length).toEqual(1);
            expect(res[0].userId).toEqual("@alice:bar");
        });

        it("should return an empty list if no membership is 'join'", function() {
            room.currentState.getMembers.andCallFake(function() {
                return [
                    { userId: "@bob:bar", membership: "invite" }
                ];
            });
            var res = room.getJoinedMembers();
            expect(res.length).toEqual(0);
        });
    });

    describe("hasMembershipState", function() {

        it("should return true for a matching userId and membership",
        function() {
            room.currentState.getMembers.andCallFake(function() {
                return [
                    { userId: "@alice:bar", membership: "join" },
                    { userId: "@bob:bar", membership: "invite" }
                ];
            });
            expect(room.hasMembershipState("@bob:bar", "invite")).toBe(true);
        });

        it("should return false if match membership but no match userId",
        function() {
            room.currentState.getMembers.andCallFake(function() {
                return [
                    { userId: "@alice:bar", membership: "join" }
                ];
            });
            expect(room.hasMembershipState("@bob:bar", "join")).toBe(false);
        });

        it("should return false if match userId but no match membership",
        function() {
            room.currentState.getMembers.andCallFake(function() {
                return [
                    { userId: "@alice:bar", membership: "join" }
                ];
            });
            expect(room.hasMembershipState("@alice:bar", "ban")).toBe(false);
        });

        it("should return false if no match membership or userId",
        function() {
            room.currentState.getMembers.andCallFake(function() {
                return [
                    { userId: "@alice:bar", membership: "join" }
                ];
            });
            expect(room.hasMembershipState("@bob:bar", "invite")).toBe(false);
        });

        it("should return false if no members exist",
        function() {
            room.currentState.getMembers.andCallFake(function() {
                return [];
            });
            expect(room.hasMembershipState("@foo:bar", "join")).toBe(false);
        });
    });

    describe("recalculate (Room Name)", function() {
        var stateLookup = {
            // event.type + "$" event.state_key : MatrixEvent
        };

        var setJoinRule = function(rule) {
            stateLookup["m.room.join_rules$"] = new MatrixEvent(
                utils.mkEvent("m.room.join_rules", roomId, userA, {
                    join_rule: rule
                })
            );
        };
        var setAliases = function(aliases, stateKey) {
            if (!stateKey) { stateKey = "flibble"; }
            stateLookup["m.room.aliases$" + stateKey] = new MatrixEvent(
                utils.mkEvent("m.room.aliases", roomId, stateKey, {
                    aliases: aliases
                })
            );
        };
        var setRoomName = function(name) {
            stateLookup["m.room.name$"] = new MatrixEvent(
                utils.mkEvent("m.room.name", roomId, userA, {
                    name: name
                })
            );
        };
        var addMember = function(userId, state) {
            if (!state) { state = "join"; }
            stateLookup["m.room.member$" + userId] = new MatrixEvent(
                utils.mkMembership(roomId, state, userId, userId)
            );
        };

        beforeEach(function() {
            stateLookup = {};
            room.currentState.getStateEvents.andCallFake(function(type, key) {
                if (key === undefined) {
                    var prefix = type + "$";
                    var list = [];
                    for (var stateBlob in stateLookup) {
                        if (!stateLookup.hasOwnProperty(stateBlob)) { continue; }
                        if (stateBlob.indexOf(prefix) === 0) {
                            list.push(stateLookup[stateBlob]);
                        }
                    }
                    return list;
                }
                else {
                    return stateLookup[type + "$" + key];
                }
            });
            room.currentState.getMembers.andCallFake(function() {
                var memberEvents = room.currentState.getStateEvents("m.room.member");
                var members = [];
                for (var i = 0; i < memberEvents.length; i++) {
                    members.push({
                        // not interested in user ID vs display name semantics.
                        // That should be tested in RoomMember UTs.
                        name: memberEvents[i].getSender(),
                        userId: memberEvents[i].getSender()
                    });
                }
                return members;
            });
        });

        it("should return the names of members in a private (invite join_rules)" +
        " room if a room name and alias don't exist and there are >3 members.",
        function() {
            setJoinRule("invite");
            addMember(userA);
            addMember(userB);
            addMember(userC);
            addMember(userD);
            room.recalculate(userA);
            var name = room.name;
            // we expect at least 1 member to be mentioned
            var others = [userB, userC, userD];
            var found = false;
            for (var i = 0; i < others.length; i++) {
                if (name.indexOf(others[i]) !== -1) {
                    found = true;
                    break;
                }
            }
            expect(found).toEqual(true, name);
        });

        it("should return the names of members in a private (invite join_rules)" +
        " room if a room name and alias don't exist and there are >2 members.",
        function() {
            setJoinRule("invite");
            addMember(userA);
            addMember(userB);
            addMember(userC);
            room.recalculate(userA);
            var name = room.name;
            expect(name.indexOf(userB)).not.toEqual(-1, name);
            expect(name.indexOf(userC)).not.toEqual(-1, name);
        });

        it("should return the names of members in a public (public join_rules)" +
        " room if a room name and alias don't exist and there are >2 members.",
        function() {
            setJoinRule("public");
            addMember(userA);
            addMember(userB);
            addMember(userC);
            room.recalculate(userA);
            var name = room.name;
            expect(name.indexOf(userB)).not.toEqual(-1, name);
            expect(name.indexOf(userC)).not.toEqual(-1, name);
        });

        it("should show the other user's name for public (public join_rules)" +
        " rooms if a room name and alias don't exist and it is a 1:1-chat.",
        function() {
            setJoinRule("public");
            addMember(userA);
            addMember(userB);
            room.recalculate(userA);
            var name = room.name;
            expect(name.indexOf(userB)).not.toEqual(-1, name);
        });

        it("should show the other user's name for private " +
        "(invite join_rules) rooms if a room name and alias don't exist and it" +
        " is a 1:1-chat.", function() {
            setJoinRule("invite");
            addMember(userA);
            addMember(userB);
            room.recalculate(userA);
            var name = room.name;
            expect(name.indexOf(userB)).not.toEqual(-1, name);
        });

        it("should show the other user's name for private" +
        " (invite join_rules) rooms if you are invited to it.", function() {
            setJoinRule("invite");
            addMember(userA, "invite");
            addMember(userB);
            room.recalculate(userA);
            var name = room.name;
            expect(name.indexOf(userB)).not.toEqual(-1, name);
        });

        it("should show the room alias if one exists for private " +
        "(invite join_rules) rooms if a room name doesn't exist.", function() {
            var alias = "#room_alias:here";
            setJoinRule("invite");
            setAliases([alias, "#another:one"]);
            room.recalculate(userA);
            var name = room.name;
            expect(name).toEqual(alias);
        });

        it("should show the room alias if one exists for public " +
        "(public join_rules) rooms if a room name doesn't exist.", function() {
            var alias = "#room_alias:here";
            setJoinRule("public");
            setAliases([alias, "#another:one"]);
            room.recalculate(userA);
            var name = room.name;
            expect(name).toEqual(alias);
        });

        it("should show the room name if one exists for private " +
        "(invite join_rules) rooms.", function() {
            var roomName = "A mighty name indeed";
            setJoinRule("invite");
            setRoomName(roomName);
            room.recalculate(userA);
            var name = room.name;
            expect(name).toEqual(roomName);
        });

        it("should show the room name if one exists for public " +
        "(public join_rules) rooms.", function() {
            var roomName = "A mighty name indeed";
            setJoinRule("public");
            setRoomName(roomName);
            room.recalculate(userA);
            var name = room.name;
            expect(name).toEqual(roomName);
        });

        it("should show your name for private (invite join_rules) rooms if" +
        " a room name and alias don't exist and it is a self-chat.", function() {
            setJoinRule("invite");
            addMember(userA);
            room.recalculate(userA);
            var name = room.name;
            expect(name).toEqual(userA);
        });

        it("should show your name for public (public join_rules) rooms if a" +
        " room name and alias don't exist and it is a self-chat.", function() {
            setJoinRule("public");
            addMember(userA);
            room.recalculate(userA);
            var name = room.name;
            expect(name).toEqual(userA);
        });

        it("should return '?' if there is no name, alias or members in the room.",
        function() {
            room.recalculate(userA);
            var name = room.name;
            expect(name).toEqual("?");
        });
    });
});