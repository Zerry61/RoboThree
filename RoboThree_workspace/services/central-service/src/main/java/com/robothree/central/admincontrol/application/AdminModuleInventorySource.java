package com.robothree.central.admincontrol.application;

import com.robothree.central.admincontrol.domain.AdminModule;
import com.robothree.central.admincontrol.domain.AdminModuleInventoryLease;
import java.time.Instant;

public interface AdminModuleInventorySource {

    AdminModule module();

    AdminModuleInventoryLease capture(Instant now);
}
