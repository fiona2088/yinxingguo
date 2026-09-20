package web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class PredictRequestDTO {
    @JsonProperty("t_init")
    private double[][] t_init;

    @JsonProperty("u_seq")
    private double[][][] u_seq;
}
